import { IsInt, IsString, IsOptional, Length, Min, Matches } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class CreateDrawingDto {
  @ApiProperty({ example: 42 })
  @IsInt()
  project_id: number

  @ApiProperty({ example: 7 })
  @IsInt()
  zone_id: number

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @IsInt()
  sub_zone_id?: number

  // Per-mark revision (wiki: features/drawing-revision-plan.md). Parsed from
  // the Tekla filename (text before the first " - ") or typed by the user
  // when parsing fails.
  //
  // Security review, fix round 1 extra item (2026-10-20): mark becomes a raw
  // path segment in the server-built final key (file-key.ts's
  // buildExpectedFileKey) — sanitisation there only replaces '/' and '\', so
  // a mark that IS the literal segment "." or ".." survives unchanged and
  // path-resolves up a directory on any consumer that normalises paths (the
  // local file-storage driver's path.join does). Reject it outright here
  // rather than silently rewrite it — this also makes '/'/'\' in mark a
  // rejection, not a silent sanitise, since a mark is meant to be one path
  // segment.
  @ApiProperty({ example: 'B1' })
  @IsString()
  @Length(1, 100)
  @Matches(/^(?!\.{1,2}$)[^/\\]+$/, {
    message: 'mark must not be "." or ".." and must not contain "/" or "\\"',
  })
  mark: string

  // Parsed from the filename's trailing "Rev n" token, or typed by the user.
  // "Current" is computed (highest rev per zone/sub-zone/mark), never stored.
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(0)
  rev: number

  // Upload BATCH number — not the drawing revision (that's `rev`, above).
  // +1 per upload action, scoped per zone(+sub-zone); every file in one
  // upload shares the same number (see useUploadDrawings). Orthogonal to
  // mark/rev: a single upload batch can touch several marks/revs at once,
  // and the same mark/rev can get files from different batches over time.
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  version: number

  // Task 11 fix round 1, finding 1 (2026-10-20): the client never supplies the
  // FINAL storage key any more — it uploads to a disposable STAGING key
  // (drawings/_incoming/<project_code>/<uuid>/<file_name>, written by
  // src/api/drawings.ts's uploadDrawing) and the server builds the real
  // drawings/<project_code>/<zone_code>/.../rev<n>/<file_name> key itself
  // (file-key.ts's buildExpectedFileKey) only after the upload is proven
  // valid. This closes the old bug where a bad PDF re-uploaded under the SAME
  // key as an existing sheet destroyed that sheet (the presigned PUT had
  // already overwritten the object before the server's own validation ran).
  @ApiProperty({ example: 'drawings/_incoming/0X220/550e8400-e29b-41d4-a716-446655440000/plan-A.pdf' })
  @IsString()
  @Matches(/^drawings\/_incoming\/[^/\\]+\/[0-9a-f-]{36}\/[^/\\]+$/, {
    message: 'upload_key must be drawings/_incoming/<project_code>/<uuid>/<filename>',
  })
  upload_key: string

  // .pdf-only as of 2026-09-15 — .dwg upload (and the Autodesk APS 2D-preview
  // push it used to trigger) was removed entirely, not just hidden from the
  // upload modal's dropzone; this is the server-side backstop so a direct
  // API call can't slip one past that UI restriction. See
  // wiki/features/drawing.md's "DWG removed entirely" entry.
  // Same traversal concern as `mark` above (file_name is the final path
  // segment in the server-built key) — a leading dot (".", "..", or
  // "..pdf"-style) or an embedded '/'/'\' is rejected outright.
  @ApiProperty({ example: 'plan-A.pdf' })
  @IsString()
  @Matches(/\.pdf$/i, { message: 'file_name must end in .pdf — .dwg upload was removed 2026-09-15' })
  @Matches(/^(?!\.)[^/\\]+$/, {
    message: 'file_name must not start with "." and must not contain "/" or "\\"',
  })
  file_name: string

  @ApiPropertyOptional({ example: 'application/pdf' })
  @IsOptional()
  @IsString()
  mime_type?: string
}
