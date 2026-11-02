/* Net engine: parse, paint, fold (math only), match options. */
(function(root){
const S3=Math.sqrt(3);
const SOLIDS={
  tetrahedron:{n:3,faces:4,verts:4,fold:Math.PI-Math.acos(1/3),name:'정사면체'},
  cube:{n:4,faces:6,verts:8,fold:Math.PI/2,name:'정육면체'},
  octahedron:{n:3,faces:8,verts:6,fold:Math.PI-Math.acos(-1/3),name:'정팔면체'},
};
const CANON={3:[[0,0],[1,0],[.5,S3/2]],4:[[0,0],[1,0],[1,1],[0,1]]};
const COLORS={black:'#000',white:'#fff',gray:'#9a9a9a',grey:'#9a9a9a',none:null};
let makeCanvas=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};

function area(p){let s=0;for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length];s+=a[0]*b[1]-b[0]*a[1];}return s/2;}
function remapW(w,order){return Array.isArray(w)&&w.length===order.length?order.map(i=>+w[i]||0):w;}
function remapPattern(pat,order){
  return (pat||[]).map(pr=>{const q=Object.assign({},pr);
    if(Array.isArray(q.p))q.p=q.p.map(w=>remapW(w,order));
    ['c','a','b'].forEach(k=>{if(Array.isArray(q[k]))q[k]=remapW(q[k],order);});return q;});
}
/* make vertex order CCW (y up), keeping pattern weights attached to the same points */
function normFace(pts,pattern){
  const n=pts.length;
  if(area(pts)>=0)return {pts:pts.map(p=>[+p[0],+p[1]]),pattern:pattern||[]};
  const order=[0];for(let i=n-1;i>=1;i--)order.push(i);
  return {pts:order.map(i=>[+pts[i][0],+pts[i][1]]),pattern:remapPattern(pattern,order),flipped:true};
}
function lat(solid,ij){return solid==='cube'?[+ij[0],+ij[1]]:[+ij[0]+ij[1]/2,ij[1]*S3/2];}

function affine3(s,d){ // canvas setTransform params mapping s[i]->d[i]
  const ux=s[1][0]-s[0][0],uy=s[1][1]-s[0][1],vx=s[2][0]-s[0][0],vy=s[2][1]-s[0][1];
  const dux=d[1][0]-d[0][0],duy=d[1][1]-d[0][1],dvx=d[2][0]-d[0][0],dvy=d[2][1]-d[0][1];
  const det=ux*vy-vx*uy; const i00=vy/det,i01=-vx/det,i10=-uy/det,i11=ux/det;
  const a=dux*i00+dvx*i10, c=dux*i01+dvx*i11, b=duy*i00+dvy*i10, dd=duy*i01+dvy*i11;
  return [a,b,c,dd,d[0][0]-(a*s[0][0]+c*s[0][1]),d[0][1]-(b*s[0][0]+dd*s[0][1])];
}
function wpt(C,w){let x=0,y=0,t=0;for(let i=0;i<C.length;i++){const k=+(w&&w[i])||0;x+=k*C[i][0];y+=k*C[i][1];t+=k;}if(t&&Math.abs(t-1)>1e-6){x/=t;y/=t;}return [x,y];}
function polyPath(ctx,P){ctx.beginPath();ctx.moveTo(P[0][0],P[0][1]);for(let i=1;i<P.length;i++)ctx.lineTo(P[i][0],P[i][1]);ctx.closePath();}

/* P: face vertices in canvas px (order = CCW in math coords) */
function paintFace(ctx,P,pattern,lw){
  const n=P.length,C=CANON[n]||CANON[3];
  const edge=Math.hypot(P[1][0]-P[0][0],P[1][1]-P[0][1])||1;
  ctx.save();polyPath(ctx,P);ctx.fillStyle='#fff';ctx.fill();ctx.clip();
  ctx.setTransform(...affine3(C.slice(0,3),P.slice(0,3)));
  const L=lw/edge;
  for(const pr of pattern||[]){
    try{
      ctx.lineWidth=L;ctx.strokeStyle='#000';ctx.lineJoin='round';
      const fill=COLORS[pr.fill]===undefined?'#000':COLORS[pr.fill];
      if(pr.t==='poly'&&Array.isArray(pr.p)&&pr.p.length>=3){
        polyPath(ctx,pr.p.map(w=>wpt(C,w)));if(fill){ctx.fillStyle=fill;ctx.fill();}else ctx.stroke();
      }else if(pr.t==='circle'){
        const c=wpt(C,pr.c);ctx.beginPath();ctx.arc(c[0],c[1],Math.max(.005,+pr.r||.2),0,Math.PI*2);
        const f=pr.fill===undefined?'none':pr.fill; if(COLORS[f]){ctx.fillStyle=COLORS[f];ctx.fill();} ctx.stroke();
      }else if(pr.t==='line'){
        const a=wpt(C,pr.a),b=wpt(C,pr.b);ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.lineWidth=L*(+pr.w||1);ctx.stroke();
      }else if(pr.t==='text'){
        const c=wpt(C,pr.c);ctx.save();ctx.translate(c[0],c[1]);ctx.rotate((+pr.angle||0)*Math.PI/180);ctx.scale(1,-1);
        const sz=Math.max(.05,+pr.size||.35);ctx.font='700 '+(sz*100)+'px sans-serif';ctx.scale(.01,.01);
        ctx.fillStyle=fill||'#000';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(pr.s||''),0,0);ctx.restore();
      }
    }catch(e){}
  }
  ctx.restore();
  ctx.save();ctx.lineWidth=lw;ctx.strokeStyle='#000';ctx.lineJoin='round';polyPath(ctx,P);ctx.stroke();ctx.restore();
}

function fitter(polys,W,H,pad){
  let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;polys.forEach(P=>P.forEach(p=>{x0=Math.min(x0,p[0]);y0=Math.min(y0,p[1]);x1=Math.max(x1,p[0]);y1=Math.max(y1,p[1]);}));
  const s=Math.min((W-2*pad)/(x1-x0||1),(H-2*pad)/(y1-y0||1));const ox=(W-(x1-x0)*s)/2,oy=(H-(y1-y0)*s)/2;
  return p=>[ox+(p[0]-x0)*s,H-(oy+(p[1]-y0)*s)];
}

/* ---- 4x4 column-major ---- */
const I4=()=>[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
function mul4(a,b){const o=new Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++){let s=0;for(let k=0;k<4;k++)s+=a[k*4+r]*b[c*4+k];o[c*4+r]=s;}return o;}
function tr4(x,y,z){const m=I4();m[12]=x;m[13]=y;m[14]=z;return m;}
function rot4(ax,th){const [x,y,z]=ax,c=Math.cos(th),s=Math.sin(th),t=1-c;
  return [t*x*x+c,t*x*y+s*z,t*x*z-s*y,0, t*x*y-s*z,t*y*y+c,t*y*z+s*x,0, t*x*z+s*y,t*y*z-s*x,t*z*z+c,0, 0,0,0,1];}
function ap4(m,p){return [m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]];}
const to3=p=>[p[0],0,-p[1]];
const key=p=>p.map(v=>Math.round(v*1000)).join(',');

/* ---- build the analysis model from the AI JSON ---- */
function build(data){
  const solid=SOLIDS[data.solid]?data.solid:'cube';
  const S=SOLIDS[solid];
  const faces=(data.net&&data.net.faces||[]).map((f,i)=>{
    const nf=normFace((f.lattice||[]).map(ij=>lat(solid,ij)),f.pattern);
    return {id:String(f.id||('면'+(i+1))),pts:nf.pts,pattern:nf.pattern};
  }).filter(f=>f.pts.length>=3);
  const warnings=[];
  if(faces.length!==S.faces)warnings.push(`면 개수가 ${faces.length}개로 인식되었습니다(${S.name}는 ${S.faces}개).`);
  // adjacency by shared edges
  const edgeMap={};
  faces.forEach((f,fi)=>f.pts.forEach((p,i)=>{const q=f.pts[(i+1)%f.pts.length];const k=[key(p),key(q)].sort().join('|');(edgeMap[k]=edgeMap[k]||[]).push({fi,p,q});}));
  const adj=faces.map(()=>[]);
  Object.values(edgeMap).forEach(l=>{if(l.length===2){adj[l[0].fi].push({to:l[1].fi,p:l[0].p,q:l[0].q});adj[l[1].fi].push({to:l[0].fi,p:l[0].p,q:l[0].q});}});
  let root=0;adj.forEach((a,i)=>{if(a.length>adj[root].length)root=i;});
  const parent=faces.map(()=>null),order=[root],seen=new Set([root]);
  for(let k=0;k<order.length;k++){const f=order[k];adj[f].forEach(e=>{if(!seen.has(e.to)){seen.add(e.to);parent[e.to]={from:f,p:e.p,q:e.q};order.push(e.to);}});}
  if(order.length!==faces.length)warnings.push('전개도의 면이 모두 이어져 있지 않습니다.');
  faces.forEach((f,i)=>{if(!parent[i])return;const P=to3(parent[i].p),Q=to3(parent[i].q);
    const ax=[Q[0]-P[0],Q[1]-P[1],Q[2]-P[2]];const L=Math.hypot(...ax);ax[0]/=L;ax[1]/=L;ax[2]/=L;
    const c=f.pts.reduce((s,p)=>[s[0]+p[0]/f.pts.length,s[1]+p[1]/f.pts.length],[0,0]);
    const test=ap4(mul4(tr4(...P),mul4(rot4(ax,.3),tr4(-P[0],-P[1],-P[2]))),to3(c));
    f.hinge={P,ax,sign:test[1]>0?-1:1};});
  function matrices(t){const M=new Array(faces.length);
    order.forEach(i=>{const pr=parent[i];if(!pr){M[i]=I4();return;}const h=faces[i].hinge;
      M[i]=mul4(M[pr.from],mul4(tr4(...h.P),mul4(rot4(h.ax,h.sign*S.fold*t),tr4(-h.P[0],-h.P[1],-h.P[2]))));});
    return M;}
  // folded topology
  const MF=matrices(1);const vk=[],vpos=[];
  faces.forEach((f,i)=>{f.w=f.pts.map(p=>ap4(MF[i],to3(p)));f.vid=f.w.map(p=>{let j=vpos.findIndex(q=>Math.hypot(q[0]-p[0],q[1]-p[1],q[2]-p[2])<1e-3);if(j<0){j=vpos.length;vpos.push(p);}return j;});
    const R=MF[i];f.normal=[R[4],R[5],R[6]];});
  if(vpos.length!==S.verts)warnings.push(`접었을 때 꼭짓점이 ${vpos.length}개가 되어 ${S.name}로 닫히지 않습니다. 전개도 인식을 확인하세요.`);
  const cen=vpos.reduce((s,p)=>[s[0]+p[0]/vpos.length,s[1]+p[1]/vpos.length,s[2]+p[2]/vpos.length],[0,0,0]);
  // net texture
  const TS=1024,toPx=fitter(faces.map(f=>f.pts),TS,TS,48);
  const tex=makeCanvas(TS,TS);const tc=tex.getContext('2d');tc.fillStyle='#fff';tc.fillRect(0,0,TS,TS);
  faces.forEach(f=>{f.px=f.pts.map(toPx);paintFace(tc,f.px,f.pattern,7);f.uv=f.px.map(p=>[p[0]/TS,1-p[1]/TS]);});
  const m={solid,S,faces,adj,matrices,vpos,cen,tex,warnings,options:[]};
  m.options=(data.options||[]).map((o,i)=>prepOption(m,o,i));
  return m;
}

function prepOption(m,o,idx){
  const faces=(o.faces||[]).map(f=>normFace(f.pts||[],f.pattern)).filter(f=>f.pts.length>=3);
  const all=[].concat(...faces.map(f=>f.pts));
  let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;all.forEach(p=>{x0=Math.min(x0,p[0]);y0=Math.min(y0,p[1]);x1=Math.max(x1,p[0]);y1=Math.max(y1,p[1]);});
  const tol=0.06*Math.hypot(x1-x0,y1-y0);const ov=[];
  faces.forEach(f=>{f.vid=f.pts.map(p=>{let j=ov.findIndex(q=>Math.hypot(q[0]-p[0],q[1]-p[1])<tol);if(j<0){j=ov.length;ov.push(p);}return j;});});
  const W=200,H=170,toPx=fitter(faces.map(f=>f.pts),W,H,10);
  faces.forEach(f=>f.px=f.pts.map(toPx));
  const own=makeCanvas(W,H);const oc=own.getContext('2d');oc.fillStyle='#fff';oc.fillRect(0,0,W,H);
  faces.forEach(f=>paintFace(oc,f.px,f.pattern,2.2));
  const res={label:o.label||('①②③④⑤'[idx]||String(idx+1)),aiVerdict:o.verdict,reason:o.reason||'',faces,own,W,H,best:null};
  if(faces.length)matchOption(m,res);
  return res;
}

function renderPred(m,opt,cfg){
  const c=makeCanvas(opt.W,opt.H),x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,opt.W,opt.H);
  opt.faces.forEach((f,i)=>{const rf=m.faces[cfg.map[i].face],sh=cfg.map[i].shift,n=f.px.length;
    for(let k=1;k<n-1;k++){const oi=[0,k,k+1];const src=oi.map(j=>rf.px[(j+sh)%n]),dst=oi.map(j=>f.px[j]);
      x.save();polyPath(x,dst);x.clip();x.setTransform(...affine3(src,dst));x.drawImage(m.tex,0,0);x.restore();}});
  return c;
}
function diff(opt,a,b){
  const w=50,h=Math.round(50*opt.H/opt.W);const small=src=>{const c=makeCanvas(w,h),x=c.getContext('2d');x.drawImage(src,0,0,w,h);return x.getImageData(0,0,w,h).data;};
  const mk=makeCanvas(opt.W,opt.H),mx=mk.getContext('2d');mx.fillStyle='#000';mx.fillRect(0,0,opt.W,opt.H);mx.fillStyle='#fff';opt.faces.forEach(f=>{polyPath(mx,f.px);mx.fill();});
  const A=small(a),B=small(b),M=small(mk);let s=0,n=0;
  for(let i=0;i<A.length;i+=4){if(M[i]<200)continue;n++;s+=Math.abs(A[i]-B[i])/255;}
  return n?s/n:1;
}
function matchOption(m,opt){
  const of=opt.faces,cfgs=[];
  m.faces.forEach((f0,fi)=>{if(f0.pts.length!==of[0].pts.length)return;
    for(let s=0;s<f0.pts.length;s++){
      const map=new Array(of.length).fill(null),vm={};let ok=true;
      const assign=(i,face,shift)=>{const n=of[i].vid.length;map[i]={face,shift};
        for(let k=0;k<n;k++){const ov=of[i].vid[k],rv=m.faces[face].vid[(k+shift)%n];if(ov in vm&&vm[ov]!==rv)ok=false;vm[ov]=rv;}};
      assign(0,fi,s);
      let progress=true;
      while(ok&&progress){progress=false;
        for(let i=0;i<of.length&&ok;i++){if(map[i])continue;
          for(let j=0;j<of.length;j++){if(!map[j])continue;
            const sh=of[i].vid.filter(v=>of[j].vid.includes(v));if(sh.length<2)continue;
            const u=sh[0],ru=vm[u],rv=vm[sh[1]];
            const cand=m.faces.findIndex((rf,ri)=>ri!==map[j].face&&rf.pts.length===of[i].pts.length&&rf.vid.includes(ru)&&rf.vid.includes(rv));
            if(cand<0){ok=false;break;}
            const n=of[i].vid.length;const shift=((m.faces[cand].vid.indexOf(ru)-of[i].vid.indexOf(u))%n+n)%n;
            assign(i,cand,shift);progress=true;break;}}}
      if(!ok||map.some(x=>!x))continue;
      if(new Set(map.map(x=>x.face)).size!==map.length)continue;
      const cfg={map,vm};cfg.score=diff(opt,opt.own,renderPred(m,opt,cfg));cfgs.push(cfg);
    }});
  cfgs.sort((a,b)=>a.score-b.score);
  opt.best=cfgs[0]||null;
  if(opt.best)opt.pred=renderPred(m,opt,opt.best);
}

const API={SOLIDS,build,paintFace,fitter,ap4,setCanvasFactory:f=>{makeCanvas=f;}};
if(typeof module!=='undefined')module.exports=API;else root.NetEngine=API;
})(this);
