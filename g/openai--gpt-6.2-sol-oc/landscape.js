/* Deterministic savanna, with separate near-ground travel and distant parallax. */
(() => {
  'use strict';
  const T = THREE, { clamp, mix, mod, smooth, vec, rng, curveSweep, glNoise } = Atlas;
  const TAU = 2*Math.PI;
  const color = (x) => new T.Color(x);
  const standard = (hex, extra={}) => new T.MeshStandardMaterial({color:hex,roughness:.99,...extra});

  function sky(scene) {
    const uniforms = {
      zenith:{value:color('#c5cfc6')}, horizon:{value:color('#f4e1ba')},
      ivory:{value:color('#fff1cf')}, solar:{value:vec(-.46,.42,.77).normalize()},
    };
    const mat = new T.ShaderMaterial({ uniforms, side:T.BackSide, depthWrite:false, toneMapped:false,
      vertexShader:`varying vec3 ray; void main(){ ray=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader:`
        varying vec3 ray; uniform vec3 zenith,horizon,ivory,solar;
        ${glNoise}
        void main(){
          vec3 p=normalize(ray);
          float y=max(p.y,0.0), light=clamp(dot(p,solar),0.0,1.0);
          vec3 col=mix(horizon,zenith,smoothstep(.008,.63,pow(y,.84)));
          col=mix(col,ivory,.22*pow(light,5.0)+.20*pow(light,32.0));
          if(p.y > .009){
            vec2 u=p.xz*(1.25/(p.y+.16));
            float n=noise31(vec3(u*vec2(1.07,1.27),8.0))*.57+noise31(vec3(u*vec2(2.4,3.5),17.0))*.30+noise31(vec3(u*6.9,31.0))*.13;
            float veil=smoothstep(.45,.72,n)*smoothstep(.017,.19,y);
            col=mix(col,ivory,veil*.73);
          }
          gl_FragColor=vec4(col,1.0);
          #include <colorspace_fragment>
        }`,
    });
    const m = new T.Mesh(new T.SphereGeometry(186,36,24),mat);
    m.renderOrder=-10; m.frustumCulled=false; scene.add(m); return m;
  }

  function ground(scene, travel) {
    const m = standard(0xffffff);
    m.onBeforeCompile = (s) => {
      Object.assign(s.uniforms,{
        travel, dust:{value:color('#b49566')}, field:{value:color('#938b55')}, dry:{value:color('#c5a877')},
        straw:{value:color('#d5b780')}, ochre:{value:color('#806847')},
      });
      s.vertexShader='varying vec2 vLand;\n'+s.vertexShader;
      s.vertexShader=s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvLand = position.xy;');
      s.fragmentShader=`varying vec2 vLand; uniform vec3 dust,field,dry,straw,ochre; uniform float travel; ${glNoise}\n`+s.fragmentShader;
      s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
        vec3 pos=vec3(vLand.x+travel,vLand.y,0.0);
        float broad=noise31(pos*.18)*.66+noise31(pos*.42+vec3(6.0,0,0))*.34;
        float scuff=noise31(pos*.60+27.0)*.29+noise31(pos*2.6)*.48+noise31(pos*6.8+11.0)*.23;
        float grain=noise31(pos*39.0)*.66+noise31(pos*91.0)*.34;
        float grit=noise31(pos*72.0);
        vec3 land=mix(dust,field,smoothstep(.35,.66,broad)*.83);
        land=mix(land,dry,smoothstep(.34,.68,scuff)*.74);
        land=mix(land,ochre,(1.0-smoothstep(.16,.44,grain))*.54);
        land=mix(land,straw,smoothstep(.61,.90,grain)*.68);
        land*=.86+.21*grit;
        diffuseColor.rgb*=land;
      `);
    };
    const o = new T.Mesh(new T.PlaneGeometry(320,320),m);
    o.rotation.x=-Math.PI*.5; o.position.y=-.007; o.receiveShadow=true; scene.add(o);
  }

  function ridges(scene) {
    const layers = [
      { r:42, amp:1.72, n:1.17, a:'#c8b694', b:'#b2a185', phase:2.40 },
      { r:64, amp:3.74, n:1.70, a:'#dac6a8', b:'#beb29a', phase:1.13 },
      { r:89, amp:5.09, n:2.31, a:'#e1ceb0', b:'#c9bfa9', phase:.76 },
      { r:116,amp:7.95, n:2.59, a:'#e6d2b3', b:'#d8cbb3', phase:.24 },
    ];
    for (const {r,amp,n,a,b,phase} of layers) {
      const p=[], idx=[], c=[], count=384, bands=8, lo=color(a), high=color(b);
      const signal=(h)=>.49+.205*Math.sin(h*5+phase)+.142*Math.sin(h*9+phase*4)+.10*Math.cos(h*13+phase*2)+.045*Math.sin(h*27+phase*6)+.014*Math.sin(h*60);
      for (let j=0;j<=bands;j++) for (let i=0;i<=count;i++) {
        const angle=i/count*TAU;
        const level=Math.pow(clamp(signal(angle),.02,1),n*.56);
        const t=j/bands, radius=r+(15.0+amp*.9)*t + 3.5*Math.cos(angle*4+phase)+3.4*Math.sin(angle*7+phase);
        const y=amp*level*Math.sin(t*Math.PI*.50)-.08;
        p.push(Math.cos(angle)*radius,y,Math.sin(angle)*radius);
        const shade=lo.clone().lerp(high,smooth(0,1,t)*(.80+.17*Math.cos(angle*17+t*2)));
        c.push(shade.r,shade.g,shade.b);
        if (i<count && j<bands) { const k=j*(count+1)+i; idx.push(k,k+1,k+count+1,k+1,k+count+2,k+count+1); }
      }
      const g=new T.BufferGeometry(); g.setIndex(idx);
      g.setAttribute('position',new T.Float32BufferAttribute(p,3)); g.setAttribute('color',new T.Float32BufferAttribute(c,3));
      const mat=new T.MeshBasicMaterial({vertexColors:true,side:T.DoubleSide,fog:false,toneMapped:false});
      scene.add(new T.Mesh(g,mat));
    }
  }

  function bag() { return {positions:[],normals:[],colors:[],indices:[]}; }
  function append(out,g,tint,transform=null) {
    const base=out.positions.length/3, a=g.attributes, v=vec(), n=vec();
    const normalMatrix=transform ? new T.Matrix3().getNormalMatrix(transform):null;
    for (let i=0;i<a.position.count;i++) {
      v.fromBufferAttribute(a.position,i); n.fromBufferAttribute(a.normal,i);
      if (transform) { v.applyMatrix4(transform); n.applyNormalMatrix(normalMatrix); }
      const c = typeof tint==='function' ? tint(i,v,n) : tint;
      out.positions.push(v.x,v.y,v.z); out.normals.push(n.x,n.y,n.z); out.colors.push(c.r,c.g,c.b);
    }
    if(g.index) for (const i of g.index.array) out.indices.push(base+i);
    else for (let i=0;i<a.position.count;i++) out.indices.push(base+i);
  }
  function finish(out) {
    const g=new T.BufferGeometry(); g.setIndex(out.indices);
    for (const [name,k] of [['position','positions'],['normal','normals'],['color','colors']]) g.setAttribute(name,new T.Float32BufferAttribute(out[k],3));
    return g;
  }

  // A little spray of irregular leaflets, used on cards at the ends of actual branches.
  function leafTexture() {
    const dim=128, canvas=document.createElement('canvas'); canvas.width=canvas.height=dim;
    const ctx=canvas.getContext('2d'), r=rng(173), half=dim*.5;
    const clumps=Array.from({length:9},(_,i)=>{
      const h=r()*TAU, d=i===0?0:15+r()*30;
      return {x:half+Math.cos(h)*d,y:half+Math.sin(h)*d,a:h};
    });
    for (const {x,y,a} of clumps) {
      ctx.beginPath();ctx.moveTo(half,half);ctx.quadraticCurveTo(x-4,y+7,x,y);
      ctx.lineWidth=1.1;ctx.strokeStyle='#958a65';ctx.stroke();
      for(let i=0;i<21;i++) {
        const theta=r()*TAU, d=Math.sqrt(r())*(11+r()*7), rad=1.5+r()*2.6, gray=162+Math.floor(r()*93);
        ctx.fillStyle=`rgb(${gray},${gray},${gray-8})`;
        ctx.beginPath();ctx.ellipse(x+Math.cos(theta)*d,y+Math.sin(theta)*d,rad,rad*(.27+r()*.37),a+(r()-.5)*2.9,0,TAU);ctx.fill();
      }
    }
    const tex=new T.CanvasTexture(canvas); tex.colorSpace=T.SRGBColorSpace; tex.anisotropy=4;
    return tex;
  }

  function acacia(seed) {
    const random=rng(seed), wood=bag(), foliage=bag();
    const bark=color('#564832'), barkLit=color('#8d7958');
    const moss=color('#626446'), mid=color('#858453'), gold=color('#aa965c'), dark=color('#585736');
    const leaf= new T.PlaneGeometry(2,2); leaf.rotateX(-Math.PI*.5);
    const uvs=[];
    const transform=new T.Matrix4(), orientation=new T.Quaternion(), rot=new T.Euler();
    const woodCurve=(pts,radii,count,sides)=>{
      const g=curveSweep(pts,radii,count,sides,vec(0,0,1));
      append(wood,g,(i,v,n)=>bark.clone().lerp(barkLit,.14+.21*random()+.18*clamp(n.z,0,1)+.17*Math.sin(i%sides*11))); g.dispose();
    };
    const cloud=(center,rx,ry,rz,density)=>{
      for (let j=0;j<density;j++) {
        const t=random()*TAU, q=Math.sqrt(random()), s=.70+random()*.65;
        const pos=vec(center.x+Math.cos(t)*rx*q,center.y+(1-q*q)*ry*.64+(random()-.50)*ry,center.z+Math.sin(t)*rz*q);
        const size=vec(rx*(.29+.25*random())*s,ry,rz*(.29+.18*random())*s);
        rot.set((random()-.5)*1.66, random()*TAU,(random()-.5)*1.66,'YXZ'); orientation.setFromEuler(rot);
        transform.compose(pos,orientation,size);
        const tintBase=moss.clone().lerp(mid,random()*.88).lerp(gold,random()*.44).lerp(dark,smooth(.2,.9,q)*.13);
        append(foliage,leaf,tintBase,transform);
        uvs.push(...leaf.attributes.uv.array);
      }
    };
    const lean=(random()-.5)*.70, tall=.84+random()*.27, fork=vec(lean*.76,1.45*tall,0), high=vec(lean+.06,2.105*tall,.05);
    woodCurve([vec(0,-.027,0),vec(.085, .39,.036),vec(lean*.26,1.02*tall,.042),fork,high], [.209,.161,.127,.103,.063],19,12);
    for(let j=0;j<7;j++) {
      const theta=j/7*TAU+random()*.47, reach=1.10+random()*1.24;
      const dx=Math.cos(theta), dz=Math.sin(theta);
      const tip=vec(lean+dx*reach,(2.90+random()*.42)*tall,dz*reach*.85);
      const origin=j%2?fork:high.clone().lerp(fork,.42);
      const mid=vec(lean+dx*reach*.51,(2.27+random()*.29)*tall,dz*reach*.39);
      woodCurve([origin,mid,mid.clone().lerp(tip,.58).add(vec(0,-.07,0)),tip],[.087,.068,.046,.008],11,8);
      for(let k=0;k<3;k++) {
        const q=tip.clone().add(vec((random()-.5)*1.53,random()*.29,(random()-.5)*1.31));
        woodCurve([mid.clone().lerp(tip,.46+.14*random()),mid.clone().lerp(q,.74),q],[.039,.024,.0034],8,6);
        cloud(q,.53+random()*.50,.14+random()*.23,.62+random()*.40,15+Math.floor(random()*8));
      }
    }
    cloud(vec(lean,3.29*tall,.05),1.14,.24,.94,44);
    leaf.dispose();
    const canopy=finish(foliage); canopy.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));
    return [finish(wood),canopy];
  }

  function trees(scene) {
    const specs = [
      [-15.1,-15.5,1.21,0], [15.0,-14.1,1.11,1], [-32.4,-10.0,1.30,2], [30,-13.1,1.05,0],
      [-3.4,-25.3,1.0,2], [13.5,-25.4,.82,0], [18.8,-30.5,1.03,2],[-22,-29.7,.84,1],
      [-16,-26.0,.71,2],[-35,-22,.95,1],[34,-23,1.07,1], [2.7,-35.1,.64,1],
      [-15,24,1.12,2], [5,22,.94,1], [33,21,1.13,0], [25,30,.94,2], [11,31,.70,0], [-34,18,1.06,2],
      [-29,28,.81,1], [16,-36,.79,0], [41,-27,1.12,1], [42,24,.91,0], [-41,-25,.94,0], [-39,22,.81,2],
    ];
    const models=[acacia(13),acacia(1123),acacia(55)], materials=[
      standard(0xffffff,{vertexColors:true}),
      standard(0xffffff,{vertexColors:true,map:leafTexture(),alphaTest:.43,alphaToCoverage:true,side:T.DoubleSide}),
    ];
    const groups=specs.map(([x,z,s,id],i)=>{
      const grp=new T.Group();
      grp.scale.setScalar(s); grp.rotation.y=i*1.426; grp.position.set(x,0,z);
      models[id].forEach((g,j)=>{ const o=new T.Mesh(g,materials[j]); o.castShadow=(Math.abs(z)<23); o.receiveShadow=true; grp.add(o); });
      scene.add(grp); return grp;
    });
    const footprint=new T.PlaneGeometry(2,2); footprint.rotateX(-Math.PI*.5);
    const shadow = new T.InstancedMesh(footprint,new T.ShaderMaterial({
      transparent:true,depthWrite:false,toneMapped:false,
      uniforms:{soil:{value:color('#695738')}},
      vertexShader:`varying vec2 pad; void main(){pad=uv*2.0-1.0; gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.0);}`,
      fragmentShader:`varying vec2 pad; uniform vec3 soil; void main(){float alpha=pow(max(0.0,1.0-dot(pad,pad)),2.76)*.32; gl_FragColor=vec4(soil,alpha);
        #include <colorspace_fragment>
      }`,
    }),specs.length);
    shadow.frustumCulled=false;scene.add(shadow);
    const temp=new T.Object3D(); temp.rotation.y=-.49;
    return (distance) => {
      groups.forEach((o,i)=>{
        o.position.x=mod(specs[i][0]-distance+45,90)-45;
        const size=o.scale.x;
        temp.position.set(o.position.x+size*.12,-.003,o.position.z-size*.06);
        temp.scale.set(size,1,size*.64);temp.updateMatrix();shadow.setMatrixAt(i,temp.matrix);
      });
      shadow.instanceMatrix.needsUpdate=true;
    };
  }

  function vegetation(scene,travel,wind) {
    const r=rng(871), width=73, depth=41;
    const amber=color('#be9f59'), pale=color('#dbbb76'), shade=color('#77714b'), reed=color('#a39757');
    const baseShape=(seed)=>{
      const random=rng(seed), pts=[], cols=[], idx=[], grow=[];
      const n=8+Math.floor(random()*6);
      for(let j=0;j<n;j++) {
        const a=random()*TAU, h=.09+Math.pow(random(),.70)*.30, f=.032+random()*.15, b=.005+random()*.007;
        const dx=Math.cos(a), dz=Math.sin(a), ox=(random()-.5)*.099, oz=(random()-.5)*.099;
        const lo=shade.clone().lerp(reed,random()*.42), hi=reed.clone().lerp(amber,random()).lerp(pale,random()*.66);
        const k=pts.length/3;
        for (let i=0;i<4;i++) {
          const t=i/3, lean=f*t*t, w=b*(i===3?.04:1-t*.66), c=lo.clone().lerp(hi,Math.pow(t,.61));
          for(const side of [-1,0,1]) {
            pts.push(ox+dx*lean-side*dz*w+(side===0?.003*dx:0), h*t, oz+dz*lean+side*dx*w+(side===0?.003*dz:0));
            cols.push(c.r*(side===0?1.07:.94),c.g*(side===0?1.07:.94),c.b*(side===0?1.07:.94));
            grow.push(t);
          }
          if(i<3) for(let b=0;b<2;b++) {const u=k+i*3+b;idx.push(u,u+1,u+3,u+1,u+4,u+3);}
        }
        if (h>.31 && random()<.55) {
          const tip=pts.length/3, x=ox+dx*.90*f,z=oz+dz*.90*f;
          pts.push(x-.010*dz,h*.860,z+.010*dx,x+.010*dz,h*.875,z-.010*dx,x+dx*.034,h*1.078,z+dz*.034);
          for (let f=0;f<3;f++) {cols.push(pale.r,pale.g,pale.b);grow.push(.92);}
          idx.push(tip,tip+1,tip+2);
        }
      }
      const g=new T.BufferGeometry();g.setIndex(idx);
      g.setAttribute('position',new T.Float32BufferAttribute(pts,3));g.setAttribute('color',new T.Float32BufferAttribute(cols,3));
      g.setAttribute('growth',new T.Float32BufferAttribute(grow,1));g.computeVertexNormals();return g;
    };
    const m=standard(0xffffff,{vertexColors:true,side:T.DoubleSide,roughness:1});
    m.onBeforeCompile=(s)=>{
      s.uniforms.travel=travel; s.uniforms.wind=wind;
      s.vertexShader='uniform float travel,wind; attribute float growth;\n'+s.vertexShader;
      s.vertexShader=s.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
        vec3 at=instanceMatrix[3].xyz;
        float px=mod(at.x-travel+36.5,73.0)-36.5;
        vec2 wave=vec2(sin(wind*1.8+at.z*1.04+at.x*.46),sin(wind*2.6+at.x*1.8+at.z*.51));
        vec3 worldShift=vec3(px-at.x+(.022+.021*wave.x)*growth*growth,0.0,(.011+.023*wave.y)*growth*growth);
        mat3 basis=mat3(instanceMatrix);
        transformed+=vec3(dot(worldShift,basis[0])/dot(basis[0],basis[0]),0.0,dot(worldShift,basis[2])/dot(basis[2],basis[2]));
      `);
    };
    const o=new T.Object3D(), N=1050;
    for(let k=0;k<4;k++) {
      const geo=baseShape(k*123+7);
      const grass=new T.InstancedMesh(geo,m,N);
      let i=0;
      while(i<N) {
        const x=(r()-.5)*width,z=(r()-.5)*depth;
        const field=.51+.21*Math.sin(x*.36+z*.42)+.19*Math.sin(x*.87-z*.63)+.08*Math.sin(x*2.2+z*1.32);
        if (r()>field+.25 || (Math.abs(z)<.74 && r()<.80)) continue;
        const size=.44+r()*.58+Math.pow(r(),5)*.63;
        o.position.set(x,-.012,z);o.rotation.y=r()*TAU;
        o.scale.set(size,size*(.7+r()*.38),size);o.updateMatrix();grass.setMatrixAt(i,o.matrix);
        const variation=.74+.26*r();grass.setColorAt(i,new T.Color().setRGB(variation,.94+(variation-.75)*.20,.79+variation*.20)); i++;
      }
      grass.frustumCulled=false; grass.receiveShadow=true; scene.add(grass);
    }
  }

  function stones(scene) {
    const r=rng(5841), n=235, geo=new T.IcosahedronGeometry(1,1), pos=geo.attributes.position;
    for(let i=0;i<pos.count;i++) {
      const q=pos.getX(i)*18.54+pos.getY(i)*23.88+pos.getZ(i)*10.22;
      const s=.92+.11*Math.cos(q)*Math.sin(q*3.73);
      pos.setXYZ(i,pos.getX(i)*s,pos.getY(i)*s,pos.getZ(i)*s);
    }
    geo.computeVertexNormals();
    const stones=new T.InstancedMesh(geo,standard(0xffffff,{flatShading:true}),n), o=new T.Object3D();
    const info=[], a=color('#897450'), b=color('#baa27d');
    for(let i=0;i<n;i++) {
      const x=(r()-.5)*54,z=(r()-.5)*32,a0=.022+Math.pow(r(),4)*.23;
      info.push({x,z,rx:a0,ry:a0*(.34+r()*.38),rz:a0*(.50+r()*.56),a:r()*TAU});
      stones.setColorAt(i,a.clone().lerp(b,r()));
    }
    stones.frustumCulled=false;stones.receiveShadow=true;scene.add(stones);
    return (distance)=>{
      info.forEach(({x,z,rx,ry,rz,a},i)=>{
        o.position.set(mod(x-distance+27,54)-27,ry*.18,z);
        o.rotation.set(0,a,0);o.scale.set(rx,ry,rz);o.updateMatrix(); stones.setMatrixAt(i,o.matrix);
      });
      stones.instanceMatrix.needsUpdate=true;
    };
  }

  function createDust(scene) {
    const r=rng(51), count=9, samples=Array.from({length:4*count},()=>({x:r(),z:r(),y:r(),seed:r(),radius:r(),delay:.10*r()}));
    const xyz=new Float32Array(samples.length*3), state=new Float32Array(samples.length*3);
    const geo=new T.BufferGeometry();
    geo.setAttribute('position',new T.BufferAttribute(xyz,3).setUsage(T.DynamicDrawUsage));
    geo.setAttribute('puff',new T.BufferAttribute(state,3).setUsage(T.DynamicDrawUsage));
    const mat=new T.ShaderMaterial({transparent:true,depthWrite:false,toneMapped:false,
      uniforms:{pixelHeight:{value:720},salt:{value:color('#dfc196')},earth:{value:color('#a48a60')}},
      vertexShader:`attribute vec3 puff; varying vec3 vPuff; uniform float pixelHeight;
        void main(){vPuff=puff; vec4 here=modelViewMatrix*vec4(position,1.0);
        gl_PointSize=clamp(puff.x*pixelHeight*projectionMatrix[1][1]/max(-here.z,.2),1.0,84.0); gl_Position=projectionMatrix*here;}
      `,
      fragmentShader:`varying vec3 vPuff; uniform vec3 salt, earth;
        ${glNoise}
        void main(){
          vec2 uv=2.0*gl_PointCoord-1.0;
          float n=noise31(vec3(uv*2.88,vPuff.z*22.0));
          float shape=1.0-smoothstep(.08,1.0,dot(uv,uv)*(1.5-n*.62));
          float a=shape*(.38+.62*n)*vPuff.y;
          gl_FragColor=vec4(mix(earth,salt,clamp((1.0-gl_PointCoord.y)*.7 + n*.35,0.0,1.0)),a);
          #include <colorspace_fragment>
        }
      `,
    });
    const cloud=new T.Points(geo,mat);cloud.frustumCulled=false;cloud.renderOrder=3;scene.add(cloud);
    return (contacts,pixelHeight)=>{
      mat.uniforms.pixelHeight.value=pixelHeight;
      cloud.visible=contacts.some(c=>c.age<.47);
      if(!cloud.visible) return;
      for(let i=0;i<samples.length;i++) {
        const c=contacts[Math.floor(i/count)], p=samples[i], t=c.age-p.delay, life=.28+p.radius*.103;
        const a=clamp(t/life,0,1), first=smooth(0,.17,a), fade=(1-a)**2;
        xyz[i*3]=c.x+(p.x-.46)*(.16+a*.29)-.082*a;
        xyz[i*3+1]=.024+.035*p.y+(.045+.084*p.y)*a;
        xyz[i*3+2]=c.z+(p.z-.5)*(.11+a*.35)+.10*a;
        state[i*3]=.037+.039*p.radius+a*.092;
        state[i*3+1]=.14*first*fade;
        state[i*3+2]=p.seed;
      }
      geo.attributes.position.needsUpdate=geo.attributes.puff.needsUpdate=true;
    };
  }

  function createLandscape(scene) {
    scene.fog=new T.FogExp2('#dbc7a3',.022);
    const dome=sky(scene), travel={value:0}, wind={value:0};
    ground(scene,travel); ridges(scene);
    const placeTrees=trees(scene), placeStones=stones(scene);
    vegetation(scene,travel,wind);
    const skylight=new T.HemisphereLight('#fff5e4','#b99b75',1.70);
    const sun=new T.DirectionalLight('#ffe2b2',2.50);
    sun.position.set(-6.4,8.8,5.3); sun.target.position.set(.05,1.2,0);
    sun.castShadow=true; sun.shadow.mapSize.set(2048,2048);
    const shadow=sun.shadow.camera;
    shadow.left=-7;shadow.right=7;shadow.top=6.7;shadow.bottom=-6.7;shadow.near=.25;shadow.far=29;
    sun.shadow.normalBias=.020;sun.shadow.bias=-.00025;
    const bounce=new T.DirectionalLight('#e7e4d5',.41);bounce.position.set(4,5,-8);
    scene.add(skylight,sun,sun.target,bounce);
    return { update(distance,t,camera) {
      dome.position.copy(camera.position);
      travel.value=mod(distance,7300); wind.value=t;
      placeTrees(distance);placeStones(distance);
    }};
  }

  Object.assign(Atlas,{createLandscape,createDust});
})();
