/* A reticulated hide in bind space. No image fetches or UV seams. */
window.Coat = (() => {
  'use strict';
  const {T, random, material, clamp, mix, smooth} = Field;
  const cache={};
  const origin = [-1.92, -.04, -.69], span = [4.76, 5.44, 1.38];
  const headOrigin = [-.289, -.292, -.254], headSpan=[.992,.531,.508];
  function bake(zone='hide') {
    if (cache[zone]) return cache[zone];
    const head=zone==='head', o=head?headOrigin:origin, box=head?headSpan:span;
    const [nx, ny, nz] = head?[112,65,44]:[160,190,55], rng = random(head?926:723), size = 64;
    const sites = new Float32Array(size*size*size*4);
    for(let k=0;k<sites.length;k+=4) {
      sites[k]=.13+.74*rng(); sites[k+1]=.12+.76*rng(); sites[k+2]=.18+.64*rng(); sites[k+3]=rng();
    }
    const bytes = new Uint8Array(nx*ny*nz*2);
    let out = 0;
    for(let iz=0;iz<nz;iz++) {
      const z=o[2]+box[2]*iz/(nz-1);
      for(let iy=0;iy<ny;iy++) {
        const y=o[1]+box[1]*iy/(ny-1);
        const limb=1-smooth(1.15,2.25,y), neck=smooth(3,4.8,y);
        for(let ix=0;ix<nx;ix++) {
          const x=o[0]+box[0]*ix/(nx-1);
          // Stretch the regions independently: big flank patches, finer down the neck and shins.
          const p=head?x*10.8-y*2.1 + .24*Math.sin(x*19+y*31+z*18)+.095*Math.sin(x*49-y*60)+15.24:
            x*(2.72+limb*.68+neck*.68) - y*neck*.41 + .10*Math.sin(y*10.4+z*8.2+x*4.2)+.027*Math.sin(y*29+x*34)+13.15;
          const q=head?y*15.4+x*1.1+.22*Math.sin(x*36+z*18+y*10)+.084*Math.sin(x*63+y*32)+13.5:
            y*2.59 - limb*(2.25-y)*1.27 + neck*(y-3)*.88 - x*.22 + .10*Math.sin(z*12.3+x*8.64+y*3.5)+.030*Math.sin(x*31+z*21)+9.81;
          const r=head?z*8.1+.22*Math.sin(y*30-x*23)+9.71:
            z*(2.05+limb*3.5+neck*1.8)+.14*Math.sin(x*5.4+y*8)+.042*Math.sin(y*21+z*21)+11.42;
          const bx=Math.floor(p),by=Math.floor(q),bz=Math.floor(r);
          let best=100, next=100, vx=0,vy=0,vz=0,wx=0,wy=0,wz=0,shade=0;
          for(let k=bz-1;k<=bz+1;k++) for(let j=by-1;j<=by+1;j++) for(let i=bx-1;i<=bx+1;i++) {
            const id=((((k&63)*size+(j&63))*size+(i&63))*4);
            const dx=i+sites[id]-p,dy=j+sites[id+1]-q,dz=k+sites[id+2]-r, d=dx*dx+dy*dy+dz*dz;
            if(d<best) {
              next=best; wx=vx; wy=vy; wz=vz; best=d; vx=dx; vy=dy; vz=dz; shade=sites[id+3];
            } else if(d<next) { next=d; wx=dx; wy=dy; wz=dz; }
          }
          const edge=(next-best)*.5/Math.sqrt((wx-vx)**2+(wy-vy)**2+(wz-vz)**2);
          bytes[out++]=Math.min(255,Math.round(edge*610)); bytes[out++]=Math.round(shade*255);
        }
      }
    }
    const texture=new T.Data3DTexture(bytes,nx,ny,nz);
    texture.format=T.RGFormat; texture.type=T.UnsignedByteType;
    texture.minFilter=texture.magFilter=T.LinearFilter;
    texture.unpackAlignment=1; texture.needsUpdate=true;
    return cache[zone]=texture;
  }
  const color = x => { const c = new T.Color(x); return `vec3(${c.r.toFixed(5)},${c.g.toFixed(5)},${c.b.toFixed(5)})`; };
  const noise = `
    float hideHash(vec3 p) {
      p = fract(p * vec3(.1031,.11369,.13787));
      p += dot(p,p.yxz+19.19);
      return fract((p.x+p.y)*p.z);
    }
    float hideNoise(vec3 x) {
      vec3 p=floor(x), f=fract(x); f=f*f*(3.-2.*f);
      return mix(mix(mix(hideHash(p),hideHash(p+vec3(1,0,0)),f.x),mix(hideHash(p+vec3(0,1,0)),hideHash(p+vec3(1,1,0)),f.x),f.y),
                 mix(mix(hideHash(p+vec3(0,0,1)),hideHash(p+vec3(1,0,1)),f.x),mix(hideHash(p+vec3(0,1,1)),hideHash(p+vec3(1,1,1)),f.x),f.y),f.z);
    }
  `;
  function make(zone = 'hide',lite=false) {
    const mat=lite?new T.MeshLambertMaterial({color:0xffffff}):material(0xffffff,.88);
    mat.customProgramCacheKey=()=>`hide.${zone}.${lite}`;
    mat.onBeforeCompile = shader => {
      if(zone==='hide' || zone==='head') shader.uniforms.reticulum={value:bake(zone)};
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 bindP; varying vec3 bindN;');
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nbindP=position; bindN=normal;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
        varying vec3 bindP; varying vec3 bindN;
        ${zone==='hide' || zone==='head' ? 'uniform highp sampler3D reticulum;' : ''}
        ${noise}
      `);
      let pigment;
      if (zone==='hide') pigment=`
        vec2 texel = texture(reticulum,(P-vec3(${origin.join(',')}))/vec3(${span.join(',')})).rg;
        float edge=texel.r*(255./610.) + .020*(hideNoise(P*58.)-.5) + .009*(fiber-.5);
        float width=.054 + .018*hideNoise(P*7.);
        float boundary=smoothstep(width-.014,width+.010,edge);
        float shins=smoothstep(.17,1.12,P.y + .12*hideNoise(P*11.));
        float belly=smoothstep(.15,.88,-N.y) * smoothstep(1.82,2.14,P.y) * (1.-smoothstep(2.4,2.8,P.y));
        vec3 network=mix(${color('#e2cdb0')},${color('#f4e5cf')},.45*belly+.64*(1.-shins));
        vec3 spot=mix(${color('#5d3426')},${color('#925432')},.74*texel.g+.26*drift);
        spot=mix(spot,${color('#9a6749')},belly*.35);
        spot=mix(${color('#a16a43')},spot,smoothstep(width-.025,width+.072,edge));
        float distal=smoothstep(.30,1.21,P.y+.13*hideNoise(P*8.)+edge);
        vec3 pigment=mix(network,spot,boundary*distal*(1.-belly*.45));
      `;
      else if(zone==='head') pigment=`
        vec2 texel=texture(reticulum,(P-vec3(${headOrigin.join(',')}))/vec3(${headSpan.join(',')})).rg;
        float x=P.x, y=P.y, z=abs(P.z), wav=hideNoise(P*68.);
        float fleck=smoothstep(.059,.080,texel.r*.418 + .027*(wav-.5));
        vec3 cream=mix(${color('#ddc3a2')},${color('#f3e0c1')}, .37+.29*drift);
        vec3 chestnut=mix(${color('#66412f')},${color('#9d6240')},.65*texel.g+.28*drift);
        vec3 pigment=mix(cream,chestnut, fleck*.93);
        float blaze=smoothstep(.29,.76,N.y) * (1.-smoothstep(.034,.130,z+.023*wav));
        float crown=smoothstep(.091,.171,y)*(1.-smoothstep(.137,.199,z))*(1.-smoothstep(-.118,-.004,x));
        pigment=mix(pigment,mix(${color('#714431')},${color('#a06c48')},drift),max(blaze*.93,crown*.87));
        vec2 oi=vec2((x-.081)/.082,(y-.065)/.054), bi=vec2((x-.082)/.097,(y-.122)/.037);
        float orbit=exp(-dot(oi,oi))*smoothstep(.10,.17,z);
        float brow=exp(-dot(bi,bi))*smoothstep(.098,.181,z);
        pigment=mix(pigment,${color('#4c3629')},orbit*.58);
        pigment=mix(pigment,cream,brow*.70);
        float nose=smoothstep(.411,.620,x+.076*(hideNoise(P*29.)-.5)+.043*N.y);
        vec3 skin=mix(${color('#604537')},${color('#92745b')},.40*drift+.34*wav+.20*fiber);
        pigment=mix(pigment,skin,nose);
        float lip=-.159-.038*smoothstep(.33,.53,x)+.049*smoothstep(.558,.685,x);
        float lp=(y-lip+.001*(wav-.5))/.0035;
        float fold=exp(-lp*lp)*smoothstep(.353,.430,x)*(1.-smoothstep(.670,.680,x));
        pigment=mix(pigment,${color('#38281e')},fold*.86);
        float chin=smoothstep(.16,.83,-N.y)*smoothstep(.42,.570,x);
        pigment=mix(pigment,${color('#a58366')},chin*.23);
      `;
      else if(zone==='ossicone') pigment=`
        float cap=smoothstep(.258,.380,P.y + .020*(drift-.5));
        vec3 pigment=mix(mix(${color('#805032')},${color('#b47d52')}, drift*.69+fiber*.31),
          mix(${color('#503729')},${color('#7d573b')},drift*.75),cap);
      `;
      else pigment=`
        vec3 pigment=mix(${color(zone==='hoof' ? '#27211d' : zone==='mane' ? '#492618' : '#ba8451')},
                         ${color(zone==='hoof' ? '#594b3c' : zone==='mane' ? '#966440' : '#dfb982')}, drift*.65+fiber*.30);
      `;
      const nap=zone==='hide'?`
        float turn=smoothstep(2.36,2.81,P.y)*(1.-smoothstep(2.985,3.49,P.y));
        float angle=turn*1.08+.21*sin(P.x*3.7)*turn;
        vec3 napP=vec3(cos(angle)*P.x-sin(angle)*P.y,sin(angle)*P.x+cos(angle)*P.y,P.z)*vec3(528.,167.,502.);
      `:`vec3 napP=P*vec3(440.,212.,439.);`;
      shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
        vec3 P=bindP, N=normalize(bindN);
        ${lite?`float fiber=.50;`:nap+`
        float grain=1.-smoothstep(.55,2.3,length(fwidth(napP)));
        float rawFiber=hideNoise(napP);
        float fiber=.5+(rawFiber-.5)*grain;
        `}
        float drift=hideNoise(P*18.);
        ${pigment}
        diffuseColor.rgb *= pigment * (.85 + .20*fiber + .10*drift);
      `);
      if(!lite && (zone==='head'||zone==='hide'||zone==='ossicone')) {
        shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
          vec3 dvx=normalize(dFdx(-vViewPosition)+vec3(1e-10)), dvy=normalize(dFdy(-vViewPosition)+vec3(1e-10));
          vec3 tangentX=cross(dvy,normal), tangentY=cross(normal,dvx);
          float facing=dot(dvx,tangentX);
          vec3 micro=.13*grain*(dFdx(rawFiber)*tangentX+dFdy(rawFiber)*tangentY);
          normal=normalize(max(.45,abs(facing))*normal-sign(facing)*micro);
        `);
      }
    };
    return mat;
  }
  return {make, bake};
})();
