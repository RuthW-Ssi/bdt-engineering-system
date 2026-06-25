from datetime import datetime, date, timedelta
import collections, os

def P(s): return datetime.strptime(s, "%Y-%m-%d %H:%M")
NOW = P("2026-06-25 08:30")            # earliest schedulable (after morning overhead)
ALLOW_OT = True
HOL = set(P(d+" 00:00").date() for d in
  ["2026-01-01","2026-01-02","2026-03-03","2026-04-13","2026-04-14","2026-04-15","2026-05-01",
   "2026-06-01","2026-06-03","2026-07-28","2026-08-12","2026-10-13","2026-10-23","2026-12-07","2026-12-31"])

def windows(d):
    if d.weekday()>5 or d in HOL: return []     # Mon-Sat=0..5 ; Sun=6 off
    if ALLOW_OT: w=[(8*60+30,12*60),(13*60,17*60+30),(18*60,22*60)]
    else:        w=[(8*60+30,12*60),(13*60,17*60+15)]
    a,b=w[-1]; w[-1]=(a,b-15)                    # shutdown 15min before end of work
    return [(datetime(d.year,d.month,d.day,x//60,x%60),datetime(d.year,d.month,d.day,y//60,y%60)) for x,y in w]

def advance(start,mins):
    d=start.date(); cur=start
    for _ in range(4000):
        for a,b in windows(d):
            s=max(cur,a)
            if s>=b: continue
            av=(b-s).total_seconds()/60
            if av>=mins: return s+timedelta(minutes=mins)
            mins-=av; cur=b
        d+=timedelta(days=1); cur=datetime(d.year,d.month,d.day,0,0)
    raise Exception("adv overflow")

def recede(end,mins):
    d=end.date(); cur=end
    for _ in range(4000):
        for a,b in reversed(windows(d)):
            e=min(cur,b)
            if e<=a: continue
            av=(e-a).total_seconds()/60
            if av>=mins: return e-timedelta(minutes=mins)
            mins-=av; cur=a
        d-=timedelta(days=1); cur=datetime(d.year,d.month,d.day,23,59)
    raise Exception("rec overflow")

def next_work(dt):
    d=dt.date()
    for _ in range(800):
        for a,b in windows(d):
            if dt<a: return a
            if a<=dt<b: return dt
        d+=timedelta(days=1); dt=datetime(d.year,d.month,d.day,0,0)
    raise Exception("nw of")
def prev_work(dt):
    d=dt.date()
    for _ in range(800):
        for a,b in reversed(windows(d)):
            if dt>b: return b
            if a<dt<=b: return dt
        d-=timedelta(days=1); dt=datetime(d.year,d.month,d.day,23,59)
    raise Exception("pw of")

# ---- DATA ----
LINES={12:[(13,2,'i'),(14,2,'i'),(15,2,'i')],6:[(12,2,'i')],11:[(10,2,'i'),(11,2,'i')],13:[(16,1,'i')],
 16:[(17,2,'i')],19:[(24,2,'i'),(25,2,'i'),(26,2,'s'),(27,2,'s'),(28,5,'s'),(29,2,'s')],22:[(30,2,'i'),(31,2,'i')],
 18:[(22,2,'i')],3:[(38,2,'i')],14:[(20,2,'i')],27:[(19,2,'i')],15:[(18,2,'i')],24:[(23,2,'i')],28:[(37,1,'i')],17:[(21,1,'i')]}
MO_DEF={51:("2026-06-24 00:30","2026-06-25 08:00"),54:("2026-06-24 00:30","2026-06-25 08:00"),
        55:("2026-07-16 00:30","2026-06-25 08:00"),57:("2026-07-23 00:30","2026-06-25 08:00")}
MO45={57:(10,11,38,"2026-06-19 15:59","2026-06-14 15:59"),58:(20,18,65,"2026-06-20 15:59","2026-06-15 15:59"),
 59:(30,16,23,"2026-06-21 15:59","2026-06-16 15:59"),60:(40,19,20,"2026-06-22 15:59","2026-06-17 15:59"),
 61:(50,19,65,"2026-06-23 15:59","2026-06-18 15:59"),62:(60,22,30,"2026-06-24 15:59","2026-06-19 15:59"),
 63:(70,3,30,"2026-06-25 15:59","2026-06-20 15:59"),64:(80,3,20,"2026-06-26 15:59","2026-06-21 15:59")}
WOS=[]; te={}; es={}
for wo,(seq,wc,dur,t,e) in MO45.items(): WOS.append((wo,45,seq,wc,dur)); te[wo]=P(t); es[wo]=P(e)
mo51=[(225,10,12,8),(217,10,12,8),(218,20,19,20),(226,20,19,20),(227,30,19,35),(219,30,19,35),(228,40,22,18),(220,40,22,18),
 (221,50,3,30),(229,50,3,30),(230,60,3,20),(222,60,3,20),(231,70,3,45),(223,70,3,45),(224,80,19,25),(232,80,19,25)]
for wo,seq,wc,dur in mo51: WOS.append((wo,51,seq,wc,dur))
mo54={(10,11,20):[157,148,121,184,175,130,166,139],(20,15,16):[149,122,185,131,140,158,167,176],
 (30,19,20):[177,150,141,168,159,132,186,123],(40,19,30):[160,187,169,124,133,142,151,178],
 (50,22,18):[152,179,125,188,170,134,161,143],(60,3,30):[153,126,162,135,171,189,180,144],
 (70,3,20):[163,181,127,136,145,154,172,190],(80,3,45):[164,173,191,128,182,137,146,155],(90,19,10):[156,147,138,129,192,183,174,165]}
for (seq,wc,dur),ids in mo54.items():
    for wo in ids: WOS.append((wo,54,seq,wc,dur))
mo55={(10,12,8):[193,209,201],(20,19,20):[202,194,210],(30,19,35):[195,203,211],(40,22,18):[196,204,212],
 (50,3,30):[205,213,197],(60,3,20):[206,198,214],(70,3,45):[215,199,207],(80,19,25):[216,200,208]}
for (seq,wc,dur),ids in mo55.items():
    for wo in ids: WOS.append((wo,55,seq,wc,dur))
for wo,seq,wc,dur in [(239,10,13,6),(240,20,17,10),(241,30,3,30),(242,40,3,25),(243,50,19,10)]: WOS.append((wo,57,seq,wc,dur))

info={wo:(mo,seq,wc,dur) for wo,mo,seq,wc,dur in WOS}
for wo,mo,seq,wc,dur in WOS:
    if mo!=45: t,e=MO_DEF[mo]; te[wo]=P(t); es[wo]=P(e)
bymo=collections.defaultdict(list)
for wo,mo,seq,wc,dur in WOS: bymo[mo].append((seq,wo))
def preds(wo):
    mo,seq,_,_=info[wo]; return [w for s,w in bymo[mo] if s<seq]
ALL_LINES=[l for wc in LINES for (l,_,_) in LINES[wc]]

def sched_event():
    sched={}; lf={l:NOW for l in ALL_LINES}; rem=set(info)
    while rem:
        ready=[w for w in rem if all(p in sched for p in preds(w))]
        ready.sort(key=lambda w:(te[w],info[w][0],info[w][1],w))
        wo=ready[0]; mo,seq,wc,dur=info[wo]
        pd=max([sched[p][1] for p in preds(wo)],default=NOW)
        est=max(NOW,es[wo],pd); best=None
        for (l,cr,md) in LINES[wc]:
            st=next_work(max(lf[l],est))
            if best is None or st<best[1]: best=(l,st)
        l,st=best; en=advance(st,dur); sched[wo]=(st,en,l); lf[l]=en; rem.discard(wo)
    return sched

def sched_backward():
    sched={}; le={l:None for l in ALL_LINES}
    order=[]
    for mo in bymo:
        for seq,wo in sorted(bymo[mo],reverse=True): order.append(wo)
    for wo in order:
        mo,seq,wc,dur=info[wo]
        succ=[sched[w][0] for (s,w) in bymo[mo] if s>seq and w in sched]
        deadline=min([te[wo]]+succ); best=None
        for (l,cr,md) in LINES[wc]:
            cap=deadline if le[l] is None else min(deadline,le[l])
            cap=prev_work(cap); st=recede(cap,dur)
            if best is None or st>best[1]: best=(l,st)
        l,st=best; en=advance(st,dur); sched[wo]=(st,en,l)
        if le[l] is None or st<le[l]: le[l]=st
    return sched

def kpi(name,sched):
    ends=[v[1] for v in sched.values()]; starts=[v[0] for v in sched.values()]
    makespan=(max(ends)-NOW).total_seconds()/3600/24
    late=sum(1 for wo,(st,en,l) in sched.items() if en>te[wo])
    tard=sum(max(0,(en-te[wo]).total_seconds()/3600) for wo,(st,en,l) in sched.items())
    past=sum(1 for st,en,l in sched.values() if st<NOW)
    busy=collections.Counter()
    for st,en,l in sched.values(): busy[l]+=(en-st).total_seconds()/60
    print(f"  [{name}] WO={len(sched)} makespan={makespan:.1f}d late(>due)={late} startBeforeNow={past} totTardiness={tard:.0f}h")
    return makespan,late,tard

def emit(vcode,src,sched):
    vals=",".join(f"({wo},'{st:%Y-%m-%d %H:%M:%S}+07','{en:%Y-%m-%d %H:%M:%S}+07',{l})" for wo,(st,en,l) in sched.items())
    return (f"insert into prod_schedule (prod_schedule_version_id,work_order_id,start_datetime,end_datetime,workcenter_line_id)\n"
            f"select v.id,x.wo,x.st::timestamptz,x.en::timestamptz,x.line from (values {vals}) x(wo,st,en,line) "
            f"join prod_schedule_version v on v.version_code='{vcode}';")

print("WOS:",len(WOS),"lines:",len(ALL_LINES))
ev=sched_event(); bk=sched_backward()
print("KPIs:"); kpi("event",ev); kpi("backward",bk)
sql=("delete from prod_schedule where prod_schedule_version_id in (select id from prod_schedule_version where version_code in ('BACKWARD-V1','EVENTBASED-V1'));\n"
 "delete from prod_schedule_version where version_code in ('BACKWARD-V1','EVENTBASED-V1');\n"
 "insert into prod_schedule_version (version_code,description,is_active,scheduler_source) values "
 "('EVENTBASED-V1','event-based fwd EDD',false,'heuristic-eventbased'),('BACKWARD-V1','backward ALAP EDD',false,'heuristic-backward');\n"
 + emit('EVENTBASED-V1','ev',ev)+"\n"+emit('BACKWARD-V1','bk',bk)+"\n")
out=os.path.join(os.path.dirname(__file__),'..','sql','aps_sched.sql')
open(out,'w').write(sql)
print("sql bytes:",len(sql),"->",os.path.relpath(out))
