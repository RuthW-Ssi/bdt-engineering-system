#!/usr/bin/env python3
"""CP-Shape-Test (2026-11-26): sleeve joints of a project, from its IFC model.

A sleeve ("SLEEVE PIPE" in the model) is the tube that fits inside two pipes at their joint. For every sleeve this
finds the pipes of its assembly that share its axis and overlap it, and how far the sleeve goes into each
(insertMm). Output: one JSON for backend/storage/cp-shape-test/sleeve-joints/<PROJECT_CODE>.json (a file, no DB:
test bench, as the end cuts). Needs ifcopenshell + numpy.

  python extract-sleeve-joints.py <model.ifc> <out.json>
"""
import json, re, sys, collections
import numpy as np
import ifcopenshell, ifcopenshell.util.element as U, ifcopenshell.util.placement as PL


def points(e):
    """World points of an element's faceted breps (mm)."""
    if not e.Representation: return None
    m = PL.get_local_placement(e.ObjectPlacement)
    pts = []
    for r in e.Representation.Representations:
        for it in r.Items:
            if it.is_a('IfcFacetedBrep'):
                for f in it.Outer.CfsFaces:
                    for b in f.Bounds: pts += [p.Coordinates for p in b.Bound.Polygon]
    if not pts: return None
    a = np.array(pts, dtype=float)
    return a @ m[:3, :3].T + m[:3, 3]


def axis(pts):
    c = pts.mean(axis=0)
    _, _, vt = np.linalg.svd(pts - c, full_matrices=False)
    return c, vt[0]


def info(e):
    q = U.get_psets(e).get('Tekla Quantity', {})
    profile = (e.ObjectType or e.Description or '').strip()
    n = [float(x) for x in re.findall(r'\d+(?:\.\d+)?', profile)]
    return {'mark': (U.get_psets(e).get('Pset_BeamCommon', {}) or {}).get('Reference') or None, 'name': (e.Name or '').strip(), 'profile': profile,
            'odMm': q.get('Height'), 'wallMm': n[1] if len(n) >= 2 else None, 'lengthMm': q.get('Length')}


def main(src, out):
    f = ifcopenshell.open(src)
    linear = [e for t in ('IfcBeam', 'IfcColumn', 'IfcMember') for e in f.by_type(t)]
    sleeves = [e for e in linear if (e.Name or '').strip().upper() == 'SLEEVE PIPE']
    joints, lonely = [], 0
    for s in sleeves:
        sp = points(s)
        agg = U.get_aggregate(s)
        if sp is None or agg is None: lonely += 1; continue
        c, a = axis(sp)
        t = (sp - c) @ a
        t0, t1 = t.min(), t.max()
        si = info(s)
        mates = []
        for k in U.get_decomposition(agg):
            if k == s or not k.is_a() in ('IfcBeam', 'IfcColumn', 'IfcMember') or (k.Name or '').strip().upper() == 'SLEEVE PIPE': continue
            ki = info(k)
            # a sleeve goes inside a bigger tube; some models draw it at its pipe's own size (0X222 sub-trusses): kept, the
            # sizes side by side say so
            if not ki['odMm'] or not si['odMm'] or ki['odMm'] < si['odMm'] - 0.5: continue
            kp = points(k)
            if kp is None: continue
            kc, ka = axis(kp)
            if abs(float(ka @ a)) < 0.995: continue  # not along the sleeve
            off = (kc - c) - ((kc - c) @ a) * a
            if np.linalg.norm(off) > 0.15 * ki['odMm']: continue  # not on the sleeve's axis
            u = (kp - c) @ a
            lo, hi = max(t0, u.min()), min(t1, u.max())
            if hi - lo < 5: continue
            mates.append({**{x: ki[x] for x in ('mark', 'name', 'profile', 'odMm', 'wallMm', 'lengthMm')}, 'insertMm': round(float(hi - lo), 1), '_at': float((lo + hi) / 2)})
        mates.sort(key=lambda m: m['_at'])
        for m in mates: del m['_at']
        joints.append({'sleeve': {**si, 'lengthMm': si['lengthMm'] or round(float(t1 - t0), 1)}, 'assembly': agg.Tag or agg.Name, 'pipes': mates})
    # same joint many times over → one row with a count
    groups = collections.OrderedDict()
    for j in joints:
        key = json.dumps([j['sleeve'], j['pipes']], sort_keys=True)
        g = groups.setdefault(key, {'sleeve': j['sleeve'], 'pipes': j['pipes'], 'count': 0, 'assemblies': []})
        g['count'] += 1
        if j['assembly'] and j['assembly'] not in g['assemblies']: g['assemblies'].append(j['assembly'])
    res = {'source': src.split('/')[-1], 'sleeves': len(sleeves), 'withoutAssembly': lonely, 'joints': list(groups.values())}
    json.dump(res, open(out, 'w'), indent=1)
    print(f"{res['source']}: {len(sleeves)} sleeves, {len(res['joints'])} distinct joints, {sum(1 for j in joints if not j['pipes'])} with no pipe found, {lonely} skipped")


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
