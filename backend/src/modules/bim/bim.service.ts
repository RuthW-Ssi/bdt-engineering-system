import { Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { ApsClientService } from './aps-client.service'
import { extractElement, type ExtractedElement } from './property-extractor'

export interface BimStatusResult {
  id: number
  status: string
  progress?: string
  error: string | null
}

@Injectable()
export class BimService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aps: ApsClientService,
  ) {}

  list(filter?: { projectId?: number }) {
    return this.prisma.bim_model.findMany({
      where: { project_id: filter?.projectId },
      orderBy: [{ major_version: 'desc' }, { minor_version: 'desc' }],
      select: {
        id: true, filename: true, translation_status: true, create_date: true,
        project_id: true, major_version: true, minor_version: true,
      },
    })
  }

  // Mirrors bom-upload's getLatestRevision, scoped by project only — BIM
  // models are uploaded at the whole-project level, not per zone/sub-zone
  // (confirmed 2026-07-21).
  async getLatestVersion(projectId: number) {
    const latest = await this.prisma.bim_model.findFirst({
      where: { project_id: projectId },
      orderBy: [{ major_version: 'desc' }, { minor_version: 'desc' }],
      select: { major_version: true, minor_version: true },
    })
    return { major_version: latest?.major_version ?? null, minor_version: latest?.minor_version ?? null }
  }

  // Step 1 of the direct-to-APS upload — no file bytes involved yet, just
  // mints a signed S3 URL the browser will PUT the file to directly.
  async initUpload(originalFilename: string) {
    await this.aps.ensureBucket()
    const objectKey = `${Date.now()}-${originalFilename}`.replace(/[^\w.\-]/g, '_')
    const { uploadKey, url } = await this.aps.createSignedUpload(objectKey)
    return { objectKey, uploadKey, url }
  }

  // Step 2 — called once the browser's direct PUT to that signed URL has
  // already succeeded. Finalizes the OSS object, then does what the old
  // single-step upload() used to do: compute the next version and create
  // the bim_model row.
  async completeUpload(
    userId: number,
    projectId: number,
    versionChoice: 'minor' | 'major',
    filename: string,
    objectKey: string,
    uploadKey: string,
  ) {
    const { urn } = await this.aps.completeUpload(objectKey, uploadKey)

    // Every upload is a new row scoped to the project — never an overwrite —
    // so this always reads the latest version for THIS project fresh, not
    // whatever the frontend last fetched.
    const { major_version, minor_version } = await this.getLatestVersion(projectId)
    const [nextMajor, nextMinor] = major_version == null
      ? [1, 0]
      : versionChoice === 'major'
        ? [major_version + 1, 0]
        : [major_version, minor_version! + 1]

    const model = await this.prisma.bim_model.create({
      data: {
        filename,
        urn,
        bucket_key: this.aps.bucketKey,
        translation_status: 'processing',
        project_id: projectId,
        major_version: nextMajor,
        minor_version: nextMinor,
        create_uid: userId,
      },
    })

    await this.aps.translate(urn)
    return model
  }

  // Called by the frontend's poll loop — checks Autodesk's manifest and, the
  // first time it sees "success" or "failed", advances our own status (and on
  // success, extracts + persists elements). Idempotent: re-polling a model
  // already marked complete/failed just returns the stored state, no API calls.
  async checkStatus(id: number): Promise<BimStatusResult> {
    const model = await this.findOrThrow(id)
    if (model.translation_status === 'complete' || model.translation_status === 'failed') {
      return { id: model.id, status: model.translation_status, error: model.translation_error }
    }
    // Extraction already claimed by another poller (or is running right now
    // within this same request a moment from now) — report the stage without
    // re-hitting Autodesk's manifest endpoint or re-attempting the claim below.
    if (model.translation_status === 'extracting') {
      return { id: model.id, status: 'extracting', error: null }
    }

    const manifest = await this.aps.getManifest(model.urn)
    // Autodesk's top-level manifest.status can stay "inprogress"/"0%" even
    // after the actual (only) derivative we requested is fully "success" —
    // confirmed by inspecting the raw manifest directly (properties.db +
    // svf2 graphics + thumbnails all "success" while top-level lagged
    // indefinitely). The derivative's own status is the authoritative signal.
    const derivative = manifest.derivatives?.[0]

    if (manifest.status === 'success' || derivative?.status === 'success') {
      // The properties database can lag a few seconds behind the derivative
      // itself reporting "success" — extracting before it's queryable
      // previously persisted 0 elements with no error at all. Stay in
      // "processing" (frontend just keeps polling) until it's actually ready.
      if (!(await this.aps.hasQueryableMetadata(model.urn))) {
        return { id: model.id, status: 'processing', progress: manifest.progress, error: null }
      }

      // Multiple pollers can reach this line for the same model (two open
      // tabs, a retry racing the previous poll) — claim the transition
      // atomically first so only the request that actually flips
      // processing→extracting runs extraction. Confirmed necessary
      // 2026-07-20: without this, two concurrent pollers double-inserted
      // every element. Claims into "extracting" (not straight to
      // "complete") so a poll landing mid-extraction can report that stage
      // instead of a DB row that says "complete" before elements exist.
      const claim = await this.prisma.bim_model.updateMany({
        where: { id: model.id, translation_status: 'processing' },
        data: { translation_status: 'extracting' },
      })
      if (claim.count === 0) {
        const current = await this.prisma.bim_model.findUniqueOrThrow({ where: { id: model.id } })
        return { id: current.id, status: current.translation_status, error: current.translation_error }
      }
      try {
        await this.extractAndPersist(model.id, model.urn)
      } catch (err) {
        await this.prisma.bim_model.update({
          where: { id: model.id },
          data: { translation_status: 'failed', translation_error: err instanceof Error ? err.message : 'Element extraction failed' },
        })
        throw err
      }
      await this.prisma.bim_model.update({
        where: { id: model.id },
        data: { translation_status: 'complete' },
      })
      return { id: model.id, status: 'complete', error: null }
    }

    if (manifest.status === 'failed' || manifest.status === 'timeout' || derivative?.status === 'failed') {
      const message = manifest.derivatives?.flatMap(d => d.messages ?? []).map(m => m.message).join('; ')
        || 'Model Derivative translation failed'
      const claim = await this.prisma.bim_model.updateMany({
        where: { id: model.id, translation_status: 'processing' },
        data: { translation_status: 'failed', translation_error: message },
      })
      if (claim.count === 0) {
        const current = await this.prisma.bim_model.findUniqueOrThrow({ where: { id: model.id } })
        return { id: current.id, status: current.translation_status, error: current.translation_error }
      }
      return { id: model.id, status: 'failed', error: message }
    }

    return { id: model.id, status: 'processing', progress: manifest.progress, error: null }
  }

  // Single streaming pass over the APS properties response, not two. The
  // original two-pass design (index assemblies, then re-fetch+stream again
  // to build rows) avoided ever buffering the *raw* Autodesk payload, but
  // still paid for fetching+parsing that payload twice — measured 2026-07-22
  // on a real 50,428-element model: 217s in production for the double-pass
  // version vs. 16.5s locally for one pass of the same data. A single pass
  // that holds the *extracted* (already-filtered, much smaller-per-item)
  // elements in one array instead is still safely bounded — measured ~140MB
  // RSS for that same model, far under the 2Gi container limit — so there's
  // no memory reason to pay for two fetches.
  private async extractAndPersist(modelId: number, urn: string) {
    // extractElement itself drops anything that isn't exactly an assembly
    // (scene-graph depth 4) or a part (depth 5) — deeper items are geometry/
    // representation duplicates of the depth-5 part, not real elements.
    const extracted: ExtractedElement[] = []
    for await (const item of this.aps.streamProperties(urn)) {
      const el = extractElement(item)
      if (el) extracted.push(el)
    }

    // Parts don't carry their own assembly's identity — look it up by matching
    // each part's parent externalId against the assemblies in this same model.
    // assembly_mark is display-only: marks repeat across physical instances
    // (e.g. one purlin type reused 257 times), so it can't scope "this part
    // belongs to THIS specific assembly" — assembly_global_id (the parent's
    // own GUID) is the real per-instance key, confirmed 2026-07-21 needed for
    // per-instance isolate/cycle-through-instances to not mix parts from
    // different same-marked assemblies together.
    const assembliesByExternalId = new Map<string, { mark: string | null; globalId: string | null }>()
    for (const el of extracted) {
      if (el.ifcType === 'IfcElementAssembly') {
        assembliesByExternalId.set(el.externalId, { mark: el.mark, globalId: el.globalId })
      }
    }

    const BATCH_SIZE = 500
    for (let i = 0; i < extracted.length; i += BATCH_SIZE) {
      const rows = extracted.slice(i, i + BATCH_SIZE).map(el => {
        const parentAssembly = el.parentExternalId ? assembliesByExternalId.get(el.parentExternalId) : undefined
        return {
          model_id: modelId,
          viewer_id: el.viewerId,
          external_id: el.externalId,
          mark: el.mark,
          global_id: el.globalId,
          ifc_type: el.ifcType,
          phase: el.phase,
          position: el.position,
          assembly_mark: parentAssembly?.mark ?? null,
          assembly_global_id: parentAssembly?.globalId ?? null,
          weight_kg: el.weightKg,
          area_m2: el.areaM2,
          length_mm: el.lengthMm,
          width_mm: el.widthMm,
          height_mm: el.heightMm,
          properties: el.properties as unknown as Prisma.InputJsonValue,
        }
      })
      await this.prisma.bim_element.createMany({ data: rows })
    }
  }

  // Re-kicks off translation for the same already-uploaded object — no
  // re-upload needed. Used by the "Retry" action on a failed model.
  async retry(id: number) {
    const model = await this.findOrThrow(id)
    await this.prisma.bim_model.update({
      where: { id },
      data: { translation_status: 'processing', translation_error: null },
    })
    await this.prisma.bim_element.deleteMany({ where: { model_id: id } })
    await this.aps.translate(model.urn)
    return { id, status: 'processing' as const }
  }

  // Excludes `properties` — for a real model (tens of thousands of elements)
  // the raw property bags alone pushed this response past Cloud Run's 32MiB
  // response cap (confirmed 2026-07-22: 59MB total, 500 "Response size was
  // too large"). Nothing on the list/tree side reads `.properties` — only
  // the property panel does, for the single currently-selected element, via
  // getElementProperties() below.
  async getElements(modelId: number) {
    await this.findOrThrow(modelId)
    return this.prisma.bim_element.findMany({
      where: { model_id: modelId },
      orderBy: { id: 'asc' },
      select: {
        id: true, model_id: true, viewer_id: true, external_id: true, mark: true, global_id: true,
        ifc_type: true, phase: true, position: true, assembly_mark: true, assembly_global_id: true,
        weight_kg: true, area_m2: true, length_mm: true, width_mm: true, height_mm: true, status: true,
      },
    })
  }

  async getElementProperties(modelId: number, elementId: number) {
    const element = await this.prisma.bim_element.findFirst({
      where: { id: elementId, model_id: modelId },
      select: { properties: true },
    })
    if (!element) throw new NotFoundException(`Element ${elementId} not found on model ${modelId}`)
    return element.properties
  }

  async getViewerToken(modelId: number) {
    const model = await this.findOrThrow(modelId)
    const token = await this.aps.getViewerAccessToken()
    return { urn: model.urn, access_token: token }
  }

  private async findOrThrow(id: number) {
    const model = await this.prisma.bim_model.findUnique({ where: { id } })
    if (!model) throw new NotFoundException(`BIM model ${id} not found`)
    return model
  }
}
