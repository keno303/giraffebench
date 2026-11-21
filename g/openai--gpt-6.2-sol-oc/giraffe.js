/* A continuous sculpted hide, a restrained facial rig, and a contact-driven walk. */
(() => {
  'use strict';
  const T = THREE, { clamp, mix, mod, smooth, vec, sculpture, sweep, curveSweep, sections, glNoise, rng } = Atlas;
  const TAU = Math.PI * 2;
  const PERIOD = 1.62, DUTY = .685, TRAVEL = 1.68;
  const bodyOrigin = vec(-.06, 2.64, 0);
  const neck = [vec(.87, 3.02), vec(1.27, 3.68), vec(1.57, 4.25), vec(1.82, 4.73)];
  const bodyRows = [
    [-1.63,2.653,0,.010,.013],[-1.57,2.663,0,.196,.192],[-1.41,2.668,0,.371,.337],
    [-1.14,2.635,0,.434,.416],[-.89,2.604,0,.437,.414],[-.60,2.586,0,.438,.398],
    [-.22,2.583,0,.500,.449],[.17,2.640,0,.550,.481],[.52,2.686,0,.579,.467],
    [.82,2.699,0,.529,.393],[1.04,2.722,0,.366,.286],[1.19,2.772,0,.192,.153],[1.27,2.805,0,.016,.018],
  ];
  const neckRows = [
    [2.22,.680,0,.046,.053],[2.40,.694,0,.240,.228],[2.71,.779,0,.475,.348],
    [2.97,.888,0,.500,.344],[3.18,1.009,0,.443,.283],[3.44,1.162,0,.361,.223],
    [3.70,1.301,0,.281,.178],[3.98,1.431,0,.225,.150],[4.24,1.557,0,.187,.137],
    [4.48,1.683,0,.166,.133],[4.68,1.788,0,.165,.144],[4.83,1.849,0,.149,.145],
    [4.94,1.846,0,.094,.112],[5.006,1.873,0,.012,.017],
  ];
  const headRows = [
    [1.62,4.753,0,.016,.015],[1.68,4.757,0,.119,.104],[1.79,4.769,0,.221,.167],
    [1.91,4.769,0,.245,.194],[2.03,4.752,0,.230,.183],[2.16,4.714,0,.207,.159],
    [2.29,4.685,0,.173,.141],[2.43,4.645,0,.145,.126],[2.54,4.619,0,.135,.144],
    [2.631,4.610,0,.112,.136],[2.68,4.613,0,.069,.100],[2.703,4.614,0,.011,.016],
  ];

  // Broad, shallow forms rather than separate geometry for muscles under the coat.
  function torsoRelief(x,y,z) {
    const side=Math.min(1,(z/.419)**2);
    if(side<.02 || y<2.14 || y>3.26) return 0;
    const shoulder=.033*Math.exp(-((x-.43+.45*(y-2.61))**2/.057+(y-2.67)**2/.148));
    const hip=.022*Math.exp(-((x+1.19+.21*(y-2.67))**2/.079+(y-2.74)**2/.124));
    const flank=-.023*Math.exp(-((x+.72)**2/.088+(y-2.35)**2/.042));
    return side*(shoulder+hip+flank)*smooth(2.14,2.26,y)*(1-smooth(3.12,3.26,y));
  }

  function muzzleRelief(x,y,z) {
    if (x<2.44 || Math.abs(z)<.055) return 0;
    const dx=x-2.635, dy=y-4.663;
    const u=.958*dx+.287*dy, v=-.287*dx+.958*dy-.006*smooth(-.035,.036,u);
    const d=(u/.037)**2+(v/.021)**2;
    return -.016*Math.exp(-d*1.18)*smooth(.052,.091,Math.abs(z));
  }

  function coatMaterial() {
    const m = new T.MeshStandardMaterial({ color: 0xffffff, roughness: .84 });
    m.onBeforeCompile = (shader) => {
      const colors = {
        sand: '#e2bd84', cream: '#f1d8a9', rust: '#a06438', umber: '#703c24',
        sock: '#d8bd95', muzzle: '#b19a81', skin: '#665142',
      };
      for (const [key, hex] of Object.entries(colors)) shader.uniforms[key] = { value: new T.Color(hex) };
      shader.vertexShader = 'varying vec3 vRestHide, vRestNormal;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvRestHide = position; vRestNormal = normal;');
      shader.fragmentShader = `varying vec3 vRestHide, vRestNormal;
        uniform vec3 sand, cream, rust, umber, sock, muzzle, skin;
        ${glNoise}
        // Nearest-cell contest in undeformed object space, so the markings move with the hide.
        vec2 hideCells(vec3 p, vec3 surfaceN) {
          vec3 cell = floor(p), f = fract(p), best = vec3(0.), runner = vec3(0.);
          float a = 9.0, b = 9.0, tint = 0.0;
          for (int k=-1; k<=1; k++) for (int j=-1; j<=1; j++) for (int i=-1; i<=1; i++) {
            vec3 off = vec3(float(i),float(j),float(k));
            vec3 h = hash33(cell+off+vec3(16.3,27.1,39.1));
            vec3 d = off + .5 + .76*(h-.5) - f;
            float ds = dot(d,d);
            if (ds < a) { b = a; runner = best; a = ds; best = d; tint = h.x; }
            else if (ds < b) { b = ds; runner = d; }
          }
          vec3 ridge = runner-best;
          float separation = max(length(ridge),.03);
          float projection = dot(ridge/separation,surfaceN);
          float slope = sqrt(max(1.0-projection*projection,0.0));
          return vec2((b-a) * .5 / (separation * mix(.34,1.0,slope)), tint);
        }
      ` + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        vec3 p = vRestHide;
        float under = (1.0-smoothstep(2.18,2.66,p.y))*(1.0-smoothstep(.02,.28,abs(p.z)));
        float back = smoothstep(2.75,3.12,p.y)*(1.0-smoothstep(3.18,3.42,p.y));
        float neckBand = smoothstep(3.1,4.75,p.y);
        float face = smoothstep(1.8,2.36,p.x)*smoothstep(4.33,4.57,p.y);
        vec3 q = p * vec3(2.64,2.86,2.87);
        q += vec3(0.0, 1.45*max(p.y-3.3,0.0)-1.76*pow(max(2.44-p.y,0.0),1.33), 1.34*p.z*neckBand);
        q.x += 2.7*max(p.x-1.86,0.0)*smoothstep(4.34,4.64,p.y);
        vec3 warp = vec3(noise31(q*1.24),noise31(q*1.24+23.0),noise31(q*1.24+51.0))-.5;
        q += warp*.32 + (vec3(noise31(p*22.0),noise31(p*23.0+13.0),noise31(p*21.0+29.0))-.5)*.092;
        vec3 padNormal = normalize(vRestNormal / vec3(2.64,3.14,2.87));
        vec2 c = hideCells(q + vec3(.31,.15,.13),padNormal);
        float textureGrain = noise31(p*vec3(325.0,94.0,212.0));
        float w = max(fwidth(c.x)*.80, .014);
        float gap = .055 + .027*c.y + .021*under + (noise31(p*39.0)-.5)*.024;
        float marking = smoothstep(gap-w,gap+w,c.x);
        float cloud = noise31(p*17.0)*.19 + noise31(p*7.0)*.16;
        float shading = clamp(c.y*.57 + cloud + .06*smoothstep(.06,.24,c.x),0.0,1.0);
        vec3 dark = mix(umber, rust, shading);
        dark = mix(dark,rust,.16*neckBand + .14*under);
        vec3 base = mix(sand,cream,clamp(.13+.56*under+.14*face-.11*back,0.0,1.0));
        vec3 hide = mix(base,dark,marking*smoothstep(.69,1.36,p.y)*(1.0-face*.73)*(1.0-.51*under));
        hide = mix(sock,hide,smoothstep(.25,1.18,p.y));
        hide = mix(hide,muzzle,.88*smoothstep(2.32,2.62,p.x)*smoothstep(4.30,4.61,p.y));
        hide = mix(hide,skin,.52*smoothstep(2.55,2.705,p.x)*(1.0-smoothstep(4.61,4.72,p.y)));
        vec2 nip=p.xy-vec2(2.635,4.663);
        vec2 noseUV=vec2(.958*nip.x+.287*nip.y,-.287*nip.x+.958*nip.y);
        noseUV.y-=.006*smoothstep(-.035,.036,noseUV.x);
        float ovalNose=length(noseUV/vec2(.034,.016));
        float sideOfFace=smoothstep(.050,.095,abs(p.z));
        float nostril=(1.0-smoothstep(.70,1.12,ovalNose))*sideOfFace;
        float nostrilFold=(1.0-smoothstep(1.0,1.62,ovalNose))*sideOfFace;
        hide=mix(hide,skin,.30*nostrilFold);
        hide=mix(hide,skin*(.21+.16*noise31(p*87.0)),.985*nostril);
        diffuseColor.rgb *= hide*(.90+.17*textureGrain+.10*noise31(p*37.0))*(1.0-.10*under);
      `);
      shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        // Submillimetre pile under raking light. Fade out before individual hairs alias.
        float footprint=max(length(dFdx(p)),length(dFdy(p)));
        float coatHeight=noise31(p*vec3(194.0,54.0,153.0))*.0011 - .0036*nostril;
        vec3 dxSurface=dFdx(-vViewPosition), dySurface=dFdy(-vViewPosition);
        vec3 axisU=cross(dySurface,normal), axisV=cross(normal,dxSurface);
        float area=dot(dxSurface,axisU);
        vec3 napGradient=sign(area)*(axisU*dFdx(coatHeight)+axisV*dFdy(coatHeight));
        float fine=1.0-smoothstep(.003,.012,footprint);
        normal=normalize(max(abs(area),1e-8)*normal-fine*napGradient);
      `);
    };
    return m;
  }

  function solveLeg(leg, x, y, pivot, lift=0) {
    const front = leg.front, nominal = leg.nominal;
    const input = x - nominal;
    const upper = front ? .716 : .813;
    const end = vec(x, y, leg.z);
    const a = front ? .903 : .914, b = front ? .980 : .956;
    const aim = Math.atan2(input+(nominal-pivot.x),pivot.y-y);
    const d0 = Math.hypot(x-pivot.x,y-pivot.y);
    const extension = a + b - .006 - .028*smooth(.79,1,input+.60);
    const triangle = (length) => Math.acos(clamp((upper*upper+d0*d0-length*length)/(2*upper*d0),-1,1));
    const swingAngle = front ? -.193+.37*input-.14*lift : .532+.45*input+.13*lift;
    let angle = front ? mix(aim-triangle(extension),swingAngle,smooth(.035,.285,lift)) : swingAngle;
    const limit = triangle(a+b-.0008);
    angle = clamp(angle,aim-limit,aim+limit);
    const mid = vec(pivot.x + upper * Math.sin(angle), pivot.y - upper * Math.cos(angle), mix(leg.z,pivot.z,.57));
    const dx = x - mid.x, dy = y - mid.y, reach = Math.hypot(dx,dy);
    const along = (a*a - b*b + reach*reach) / (2*reach);
    const across = Math.sqrt(Math.max(0, a*a - along*along)) * (front ? 1 : -1);
    const joint = vec(mid.x + (dx*along - dy*across)/reach, mid.y + (dy*along + dx*across)/reach, mix(leg.z,pivot.z,.21));
    return [pivot, mid, joint, end];
  }

  // Hind then fore on the same side; the second pair repeats half a stride later.
  const legs = [
    { front:false, z:-.344, strike:0, nominal:-.977, origin:vec(-1.047,2.642,-.348) },
    { front:true, z:-.330, strike:.155, nominal:.774, origin:vec(.708,2.720,-.320) },
    { front:false, z:.344, strike:.5, nominal:-.977, origin:vec(-1.047,2.642,.348) },
    { front:true, z:.330, strike:.655, nominal:.774, origin:vec(.708,2.720,.320) },
  ].map((l,i) => ({ ...l, code:['LH','LF','RH','RF'][i], rest:solveLeg(l,l.nominal,.220,l.origin) }));

  function legLoft(l) {
    const [top, mid, joint, ankle] = l.rest;
    const s = (a,b,t,rx,rz,dx=0) => [mix(a.y,b.y,t),mix(a.x,b.x,t)+dx,mix(a.z,b.z,t),rx,rz];
    const rows = l.front ? [
      [.086,ankle.x+.036,l.z,.033,.047],[.126,ankle.x+.033,l.z,.077,.070],[.206,ankle.x+.007,l.z,.084,.076],
      s(ankle,joint,.14,.066,.061),s(ankle,joint,.48,.054,.052),s(ankle,joint,.80,.063,.056),
      s(ankle,joint,.99,.092,.071,-.010),s(joint,mid,.17,.080,.071),s(joint,mid,.55,.105,.085),
      s(joint,mid,.86,.137,.102),s(mid,top,.08,.178,.135),s(mid,top,.36,.217,.154),
      s(mid,top,.77,.234,.171,-.050),[top.y+.079,top.x-.076,l.z*.83,.183,.145],
      [top.y+.240,top.x-.074,l.z*.71,.036,.037],
    ] : [
      [.092,ankle.x+.036,l.z,.034,.048],[.132,ankle.x+.034,l.z,.079,.069],[.211,ankle.x+.006,l.z,.081,.078],
      s(ankle,joint,.16,.055,.058),s(ankle,joint,.50,.050,.052),s(ankle,joint,.83,.064,.055),
      s(ankle,joint,.99,.089,.075,.007),s(joint,mid,.17,.091,.073),s(joint,mid,.51,.122,.091,-.008),
      s(joint,mid,.83,.153,.105,-.038),s(mid,top,.07,.219,.149,-.058),s(mid,top,.45,.300,.178,-.025),
      s(mid,top,.82,.332,.209,.005),[top.y+.110,top.x+.022,l.z*.83,.239,.171],
      [top.y+.273,top.x+.037,l.z*.71,.034,.039],
    ];
    return { axis:1, rows, blend:l.front ? .120 : .135 };
  }

  function standard(color, roughness = .85, options = {}) { return new T.MeshStandardMaterial({color,roughness,...options}); }
  function mesh(g, m, parent, shadow = true) {
    const o = new T.Mesh(g,m); o.castShadow = shadow; o.receiveShadow = true; parent.add(o); return o;
  }
  const sphere = new T.SphereGeometry(1,24,16);
  function oval(parent,m,x,y,z,rx,ry,rz) {
    const o = mesh(sphere,m,parent,false);
    o.position.set(x,y,z); o.scale.set(rx,ry,rz); return o;
  }

  // The two toes have separate, bevelled sole outlines and subtle vertical horn grain.
  const hoofRings = [
    [-.220,.045,.119,.038],[-.211,.047,.126,.040],[-.195,.048,.125,.040],
    [-.140,.040,.117,.039],[-.092,.030,.102,.036],[-.054,.019,.077,.029],[-.034,.013,.054,.023],
  ];
  function makeHoof(root, leg) {
    const hoof = new T.Group(); hoof.name=`${leg.code} hoof`; root.add(hoof);
    const m = standard(0xffffff,.72,{vertexColors:true}), cols = ['#3c3229','#4c3e31','#78614b'].map(x=>new T.Color(x));
    for (const side of [-1,1]) {
      const n = 28;
      const g = sweep(hoofRings.map(([y,x,a,b],i)=>[vec(x,y,side*(.041-i*.0016)),a,b]),n,vec(1,0,0), (v,u,w,i,j) => {
        const grain = .10 * Math.sin(j*12.3) + .045 * Math.sin(j*24.8+v*4.0);
        return cols[0].clone().lerp(cols[1], .40 + .49*v + grain).lerp(cols[2],smooth(.48,1,v)*(.53+grain));
      },vec(0,1,0));
      mesh(g,m,hoof);
    }
    return hoof;
  }

  function ear(head, side) {
    const pivot = new T.Group(); head.add(pivot);
    pivot.position.set(1.764,4.842,side*.121);
    const lift = side < 0 ? .045 : 0;
    const points = [vec(),vec(-.052,.046,side*.141),vec(-.108,.094+lift*.46,side*.279),vec(-.171,.137+lift*.85,side*.396),vec(-.220,.129+lift,side*.454)];
    const shape = [[.044,.031],[.065,.027],[.091,.032],[.058,.022],[.001,.001]];
    const rim = new T.Color('#cb9455'), inner = new T.Color('#84563d'), nap = new T.Color('#c69a6a'), back = new T.Color('#b3814c');
    const material = standard(0xffffff,.88,{vertexColors:true});
    mesh(curveSweep(points,shape,24,24,vec(-.20,1,side*-.18),(t,u,v,i,j) => {
      const facing = -v * side;
      const inside = smooth(.30,.82,facing) * smooth(.13,.33,t) * (1-smooth(.76,.976,t));
      const crease = Math.exp(-(((u+.21+t*.21)/.19)**2)) * Math.sin(Math.PI*t) * inside;
      return back.clone().lerp(rim,smooth(.2,.98,Math.abs(u))*.69+.22)
        .lerp(inner.clone().lerp(nap,smooth(.36,.94,t)*.58+crease*.22),inside)
        .multiplyScalar(1+.028*Math.sin(i*1.23+j*2.27));
    }),material,pivot);
    return pivot;
  }

  const faceZ = (x,y) => {
    const [center,,ry,rz] = sections(headRows,x);
    return Math.sqrt(Math.max(.008,1-((y-center)/ry)**2))*rz;
  };
  function faceCurve(parent, mat, side, coords, radii) {
    const points = coords.map(([x,y,offset = .002])=>vec(x,y,side*(faceZ(x,y)+offset)));
    return mesh(curveSweep(points,radii,20,8,vec(0,0,1)),mat,parent,false);
  }

  function details(parent) {
    const head = new T.Group(); parent.add(head);
    const sculpt = new T.Group(); sculpt.position.copy(neck[3]).negate(); head.add(sculpt);
    const ears = [], eyes = [];
    const hornMat = standard(0xffffff,.91,{vertexColors:true});
    const tan = new T.Color('#b68148'), burnt = new T.Color('#664229'), chocolate = new T.Color('#3e2a21');
    const random = rng(442);
    const eyeRim = standard(0x71513a), lid = standard(0x3c2b21,.86), lash = standard(0x33251c);
    const iris = new T.MeshPhysicalMaterial({color:0x2d1c11,roughness:.25,clearcoat:.85,clearcoatRoughness:.18});
    const pupil = new T.MeshPhysicalMaterial({color:0x140e09,roughness:.20,clearcoat:.87,clearcoatRoughness:.16});
    const glint = new T.MeshBasicMaterial({color:0xffe7ba});
    const lip = standard(0x6c513a,.87);
    for (const side of [-1,1]) {
      ears.push(ear(sculpt,side));
      const asym = side < 0 ? .039 : -.005;
      const horn = [vec(1.882,4.940,side*.110),vec(1.865+asym*.26,5.024,side*.126),vec(1.833+asym*.54,5.132,side*.150),vec(1.809+asym*.94,5.224,side*.167),vec(1.797+asym,5.279,side*.181)];
      mesh(curveSweep(horn,[[.076,.077],[.056,.057],[.049,.052],[.066,.058],[.010,.012]],26,20,vec(0,0,1),(t,u,v,i,j) => {
        return tan.clone().lerp(burnt,smooth(.28,.81,t)).lerp(chocolate,smooth(.64,.94,t)*.83).multiplyScalar(.85+.25*random());
      }),hornMat,sculpt);
      for (let i = 0; i < 24; i++) {
        const a = random()*TAU, c = Math.cos(a), s = Math.sin(a), l = .009 + random()*.027;
        const q = vec(1.808+asym*.94+c*.049,5.229+random()*.035,side*.172+s*.048);
        mesh(sweep([[q,.005,.004],[q.clone().add(vec(-l*.60,l*.88,s*l*.67)),.00045,.00045]],5),lash,sculpt,false);
      }

      const ex = 2.048, ey = 4.825, ez = faceZ(ex,ey);
      const moving = new T.Group(), eye = new T.Group();
      moving.position.set(ex,ey,side*ez); eye.position.copy(moving.position).negate();
      moving.add(eye); sculpt.add(moving); eyes.push(moving);
      const brow = oval(sculpt,eyeRim,ex-.007,ey+.001,side*(ez-.004),.064,.042,.021);
      brow.rotation.z = -.12; brow.rotation.y = side*.30;
      const eyeball = oval(eye,iris,ex,ey,side*(ez+.014),.051,.030,.021);
      eyeball.rotation.z = -.11; eyeball.rotation.y = side*.30;
      const dark = oval(eye,pupil,ex+.010,ey+.001,side*(ez+.031),.028,.022,.006);
      dark.rotation.y = side*.36;
      oval(eye,glint,ex+.019,ey+.012,side*(ez+.037),.0048,.0028,.0014);
      faceCurve(eye,lid,side,[[1.991,4.823,.011],[2.012,4.850,.024],[2.054,4.852,.029],[2.096,4.834,.020],[2.104,4.818,.010]], [.002,.005,.0048,.002]);
      faceCurve(eye,eyeRim,side,[[1.991,4.819,.008],[2.017,4.803,.023],[2.062,4.799,.021],[2.105,4.818,.012]], [.002,.0034,.0036,.002]);
      for (let i = 0; i < 7; i++) {
        const x = 1.995 + i*.011, y = 4.853-.010*((i-3)/3)**2;
        const p = vec(x,y,side*(faceZ(x,y)+.024));
        mesh(curveSweep([p,p.clone().add(vec(-.013,.009,side*.015)),p.clone().add(vec(-.020,.014,side*(.025 + (i%3)*.004)))], [.00165,.0011,.00032],5,5,vec(0,1,0)),lash,eye,false);
      }

      faceCurve(sculpt,lip,side,[[2.269,4.548,.001],[2.347,4.546,.002],[2.466,4.541,.003],[2.575,4.551,.003],[2.652,4.563,.003],[2.677,4.577,.004]], [.0008,.0027,.0032,.0035,.0023]);
    }
    return { head, ears, eyes };
  }

  function makeMane(restHide) {
    // Intersect the sculpted midline to follow its exact dorsal contour, even at the withers.
    const vertices=restHide.attributes.position, indices=restHide.index.array, segments=[];
    for(let i=0;i<indices.length;i+=3) {
      const a=indices[i], b=indices[i+1], c=indices[i+2];
      if (Math.max(vertices.getY(a),vertices.getY(b),vertices.getY(c))<3.13) continue;
      const az=vertices.getZ(a), bz=vertices.getZ(b), cz=vertices.getZ(c);
      if ((az>0 && bz>0 && cz>0) || (az<0 && bz<0 && cz<0)) continue;
      const cuts=[];
      for(const [u,v] of [[a,b],[b,c],[c,a]]) {
        const uz=vertices.getZ(u), vz=vertices.getZ(v);
        if ((uz>0)===(vz>0)) continue;
        const t=uz/(uz-vz);
        cuts.push([mix(vertices.getX(u),vertices.getX(v),t),mix(vertices.getY(u),vertices.getY(v),t)]);
      }
      if(cuts.length===2) segments.push(cuts);
    }
    const path=Array.from({length:32},(_,i)=>{
      const y=mix(3.148,4.901,i/31);
      let x=Infinity;
      for(const [[ax,ay],[bx,by]] of segments) if((ay>y)!==(by>y)) x=Math.min(x,mix(ax,bx,(y-ay)/(by-ay)));
      if(!Number.isFinite(x)) { const [center,,width]=sections(neckRows,y); x=center-width; }
      return vec(x+.005,y,0);
    });
    const profile = [[0,.005,.008],[.12,.055,.052],[.24,.060,.065],[.56,.041,.056],[.82,.032,.046],[.94,.039,.049],[1,.008,.012]];
    const rand = rng(27), a = new T.Color('#5e3926'), b = new T.Color('#905e39');
    const spine = new T.CatmullRomCurve3(path);
    const g = sweep(Array.from({length:90},(_,i)=>{
      const t = i/89, p = spine.getPoint(t), [w,h] = sections(profile,t);
      p.x -= .012 * Math.sin(i * 1.15) + .011 * Math.sin(i * 2.63);
      return [p,w*(.86+rand()*.24),h*(.68+rand()*.37)];
    }),14,vec(0,0,1),(t,u,v) => a.clone().lerp(b,clamp(.36+.31*v+.23*rand()+.14*Math.sin(t*130),0,1)));
    const p=[...g.attributes.position.array], c=[...g.attributes.color.array], ix=[...g.index.array];
    for(let i=0;i<205;i++) {
      const t=.045+rand()*.93, [w,h]=sections(profile,t);
      const tangent=spine.getTangent(t), out=vec(-tangent.y,tangent.x,0).normalize();
      const pt=spine.getPoint(t).addScaledVector(out,h*(.64+rand()*.31));
      pt.z=(rand()-.5)*w*1.3;
      const k=p.length/3, len=.008+rand()*.033, width=.0015+rand()*.0030;
      const mid=pt.clone().addScaledVector(out,len*.74).addScaledVector(tangent,-len*.41);
      const tip=mid.clone().addScaledVector(out,len*.33).addScaledVector(tangent,-len*.29);
      tip.z+=(rand()-.5)*.028;
      p.push(pt.x,pt.y,pt.z-width,pt.x,pt.y,pt.z+width,mid.x,mid.y,mid.z-width*.51,mid.x,mid.y,mid.z+width*.51,tip.x,tip.y,tip.z);
      ix.push(k,k+2,k+1,k+2,k+3,k+1,k+2,k+4,k+3);
      const strand=a.clone().lerp(b,.21+rand()*.48);
      for(let j=0;j<5;j++) c.push(strand.r,strand.g,strand.b);
    }
    g.setAttribute('position',new T.Float32BufferAttribute(p,3));
    g.setAttribute('color',new T.Float32BufferAttribute(c,3));
    g.deleteAttribute('uv');g.deleteAttribute('normal');g.setIndex(ix);g.computeVertexNormals();
    return [g,standard(0xffffff,.98,{vertexColors:true,side:T.DoubleSide})];
  }

  function makeTail(root) {
    const group = new T.Group(); root.add(group);
    const base = vec(-1.485,2.888,0);
    const hair = standard(0xffffff,.97,{vertexColors:true}), hide = standard(0xffffff,.94,{vertexColors:true}), thin = standard(0x543622,.98);
    const path = [vec(),vec(-.189,-.126,0),vec(-.315,-.384,.013),vec(-.364,-.706,.040),vec(-.329,-1.003,.059),vec(-.298,-1.130,.060)];
    const top=new T.Color('#9f6437'), end=new T.Color('#c09969');
    mesh(curveSweep(path,[.067,.049,.033,.026,.020,.013],32,13,vec(0,0,1),(t,u,v) => {
      const shade=smooth(.06,.88,t)*.72+.09*Math.sin(t*19)+.12*v;
      return top.clone().lerp(end,clamp(shade,0,1));
    }),hide,group);
    const tuft = [vec(-.316,-1.024,.055),vec(-.308,-1.108,.062),vec(-.301,-1.217,.069),vec(-.287,-1.348,.070),vec(-.279,-1.403,.065)];
    const low = new T.Color('#3c2b22'), high = new T.Color('#775235'), rand = rng(221);
    mesh(curveSweep(tuft,[[.020,.018],[.041,.039],[.058,.048],[.040,.034],[.003,.004]],22,18,vec(0,0,1),()=>low.clone().lerp(high,rand()*.69)),hair,group);
    for (let i=0;i<25;i++) {
      const angle = rand()*TAU, x = Math.cos(angle), z = Math.sin(angle);
      const p = vec(-.300+x*.036,-1.184+rand()*.10,.065+z*.034);
      mesh(curveSweep([p,p.clone().add(vec(.017+x*.019,-.105,z*.021)),p.clone().add(vec(.026+x*.033,-.19-rand()*.072,z*.025))],[.0034,.0029,.0003],7,5),thin,group,false);
    }
    return { group, base };
  }

  function createGiraffe() {
    const root = new T.Group(); root.name = 'Giraffe';
    const all = [bodyOrigin,...neck,...legs.flatMap(l => l.rest)];
    const names = ['Torso','Withers','Neck middle','Upper neck','Skull',...legs.flatMap(l=>['upper','middle','lower','fetlock'].map(part=>`${l.code} ${part}`))];
    const bones = all.map((origin,i) => {
      const bone = new T.Bone(); bone.position.copy(origin); bone.name = names[i];
      root.add(bone); return bone;
    });
    const slots = { trunk:0, lowerNeck:1, midNeck:2, upperNeck:3, skull:4, limbs:5 };
    root.updateMatrixWorld(true);
    const skeleton = new T.Skeleton(bones);
    const limbVolumes=legs.map(legLoft);
    function limbWeights(leg,base,y,w=1) {
      const [,e,k,f] = leg.rest;
      const joints = [[e.y,.235],[k.y,.183],[f.y+.04,.098]];
      for (let i=0;i<3;i++) {
        const [joint,width] = joints[i];
        if (y > joint+width) return [[base+i,w]];
        if (y > joint-width) {
          const a = smooth(joint-width,joint+width,y);
          return [[base+i,a*w],[base+i+1,(1-a)*w]];
        }
      }
      return [[base+3,w]];
    }
    const weightRow = (x,y,z, mane) => {
      const neckAmount = smooth(2.95,3.39,y) * (mane ? 1 : smooth(-.23,.27,x));
      if (neckAmount > 0) {
        if (y < 3.39) return [[slots.trunk,1-neckAmount],[slots.lowerNeck,neckAmount]];
        if (y < 3.92) { const t = smooth(3.43,3.91,y); return [[slots.lowerNeck,1-t],[slots.midNeck,t]]; }
        if (y < 4.49) { const t = smooth(3.99,4.47,y); return [[slots.midNeck,1-t],[slots.upperNeck,t]]; }
        const t = Math.max(smooth(4.49,4.72,y),smooth(1.91,2.17,x));
        return [[slots.upperNeck,1-t],[slots.skull,t]];
      }
      if (y > 2.94) return [[slots.trunk,1]];
      if (y < 1.93) {
        const i=(z>0?2:0)+(x>-.15?1:0);
        return limbWeights(legs[i],slots.limbs+i*4,y);
      }
      const influences=[];
      let total=0;
      for (let i=0;i<legs.length;i++) {
        const l=legs[i], {rows}=limbVolumes[i];
        if (y > rows[rows.length-1][0]) continue;
        const [cx,cz,rx,rz]=sections(rows,y);
        const radius=Math.hypot((x-cx)/rx,(z-cz)/rz);
        const attached=(1-smooth(1.025,1.98,radius))*(1-smooth(l.front?2.18:2.20,l.front?2.92:2.88,y))*smooth(.025,.210,Math.abs(z));
        const own=(z>0?2:0)+(x>-.15?1:0)===i;
        const w=mix(own?1:0,attached,smooth(1.93,2.07,y));
        if (w < .00001) continue;
        total+=w;
        influences.push(...limbWeights(l,slots.limbs+i*4,y,w));
      }
      if(total<1) influences.push([slots.trunk,1-total]);
      influences.sort((a,b)=>b[1]-a[1]);
      const best=influences.slice(0,4), sum=best.reduce((a,b)=>a+b[1],0);
      return best.map(([i,w])=>[i,w/sum]);
    };
    function skin(g,m,mane=false) {
      const p = g.attributes.position, idx = new Uint16Array(p.count*4), weight = new Float32Array(p.count*4);
      for (let i=0;i<p.count;i++) for (const [j,[index,value]] of weightRow(p.getX(i),p.getY(i),p.getZ(i),mane).entries()) {
        idx[i*4+j]=index; weight[i*4+j]=value;
      }
      g.setAttribute('skinIndex',new T.Uint16BufferAttribute(idx,4));
      g.setAttribute('skinWeight',new T.Float32BufferAttribute(weight,4));
      const o = new T.SkinnedMesh(g,m); o.castShadow = o.receiveShadow = true; o.frustumCulled = false;
      root.add(o); o.bind(skeleton,new T.Matrix4()); return o;
    }
    const hide = sculpture([
      {axis:0,rows:bodyRows,blend:.0,relief:torsoRelief},{axis:1,rows:neckRows,blend:.254},
      ...limbVolumes,{axis:0,rows:headRows,blend:.071,relief:muzzleRelief},
    ],.018);
    skin(hide,coatMaterial());
    const [maneGeo,maneMat] = makeMane(hide); skin(maneGeo,maneMat,true);
    const { head, ears, eyes } = details(root), tail = makeTail(root), hooves = legs.map(l=>makeHoof(root,l));
    const contacts=legs.map(l=>({age:0,x:l.nominal,z:l.z,grounded:true}));
    const bodyQ = new T.Quaternion(), euler = new T.Euler(), rotation = new T.Quaternion(), zAxis = vec(0,0,1);
    const bodyAt = vec(), temp1 = vec(), temp2 = vec();
    const bodyPoint = (p, dest = vec()) => dest.copy(p).sub(bodyOrigin).applyQuaternion(bodyQ).add(bodyAt);
    const restDirections = legs.map(l=>l.rest.slice(0,3).map((p,j)=>l.rest[j+1].clone().sub(p).normalize()));

    function step(time) {
      const cycle = time/PERIOD;
      const wave = TAU*cycle;
      const bob = .025*Math.cos(2*wave-.85)+.009*Math.sin(wave-.4);
      euler.set(.029*Math.sin(wave+.2),.011*Math.sin(wave-.4),.022*Math.sin(2*wave+.2));
      bodyQ.setFromEuler(euler);
      bodyAt.copy(bodyOrigin).add(temp1.set(.018*Math.sin(2*wave-.22),bob,.039*Math.sin(wave+.4)));
      bones[0].position.copy(bodyAt); bones[0].quaternion.copy(bodyQ);
      const neckAngles = [
        -.019*Math.sin(2*wave-.68)-.008*Math.cos(wave),
        -.017*Math.sin(2*wave-1.02),-.014*Math.sin(2*wave-1.3),
        .037*Math.sin(2*wave-1.05)+.015*Math.cos(wave-.2),
      ];
      for (let j=0;j<neck.length;j++) {
        const b = bones[j+1], previous = bones[j];
        if (j===0) bodyPoint(neck[0],b.position);
        else b.position.copy(neck[j]).sub(neck[j-1]).applyQuaternion(previous.quaternion).add(previous.position);
        euler.set(j<3 ? .006*Math.sin(wave-j*.19) : -.010*Math.sin(wave), j===3 ? -.084+.095*Math.sin(wave*.25-.3) : 0, neckAngles[j]);
        b.quaternion.copy(previous.quaternion).multiply(rotation.setFromEuler(euler));
      }
      head.position.copy(bones[4].position); head.quaternion.copy(bones[4].quaternion);
      for (let j=0;j<2;j++) {
        const twitch = Math.pow(Math.max(0,Math.sin(wave*.233+j*1.9)),28);
        ears[j].rotation.set((j===0?-1:1)*(.055*Math.sin(wave+.8+j)+.23*twitch),(j===0?-.23:.025)+.045*Math.cos(wave+j*3)+.15*twitch,.025*Math.cos(wave-j));
        const blink = mod(time+.99+j*.015,5.41);
        eyes[j].scale.y = 1 - .94*Math.sin(Math.PI*smooth(0,.214,blink));
      }
      for (let i=0;i<legs.length;i++) {
        const l=legs[i], phase=mod(cycle-l.strike,1), stride=DUTY*TRAVEL;
        let x, height=0, angle=0;
        if (phase < DUTY) {
          const t = phase/DUTY;
          x = l.nominal+stride*.5 - TRAVEL*phase;
          angle = -.39*smooth(.77,1,t) + .14*(1-smooth(0,.18,t));
        } else {
          const t = (phase-DUTY)/(1-DUTY);
          const cubic = 2*t*t*t-3*t*t+t;
          x = l.nominal - stride*.5 + stride*smooth(0,1,t) - TRAVEL*(1-DUTY)*cubic;
          height = (l.front ? .365 : .276)*Math.pow(Math.sin(Math.PI*Math.pow(t,.83)),1.39);
          angle = mix(-.39,.14,smooth(.23,.82,t)) - .53*Math.sin(TAU*t)*Math.sin(Math.PI*t);
        }
        const c = Math.cos(angle), s = Math.sin(angle);
        let low = Infinity, heelX=0, heelY=0;
        for (const [y,center,r] of hoofRings) {
          const localX=center-r*Math.sign(s), worldY=y*c+localX*s;
          if (worldY<low) { low=worldY; heelX=localX; heelY=y; }
        }
        // Pivot around the bearing edge when the hoof rolls, rather than sliding the sole.
        x+=heelX*(1-c)+heelY*s;
        const pose = solveLeg(l,x,-low+height,bodyPoint(l.origin),height);
        for (let j=0;j<4;j++) {
          const b = bones[5+i*4+j]; b.position.copy(pose[j]);
          if (j<3) b.quaternion.setFromUnitVectors(restDirections[i][j],temp2.copy(pose[j+1]).sub(pose[j]).normalize());
          else b.quaternion.setFromAxisAngle(zAxis,angle);
        }
        hooves[i].position.copy(pose[3]); hooves[i].rotation.z=angle;
        Object.assign(contacts[i],{age:phase*PERIOD,x:l.nominal+stride*.5-.071-TRAVEL*phase,z:l.z,grounded:phase<DUTY});
      }
      bodyPoint(tail.base,tail.group.position);
      const swish = .19*Math.sin(wave*.51+.9)+.065*Math.sin(wave+1.5);
      euler.set(swish,.04*Math.sin(wave*.58),-.062+.09*Math.cos(wave+.6));
      tail.group.quaternion.copy(bodyQ).multiply(rotation.setFromEuler(euler));
    }
    step(0);
    return { root, step, contacts, velocity:TRAVEL/PERIOD, period:PERIOD };
  }

  Atlas.createGiraffe = createGiraffe;
})();
