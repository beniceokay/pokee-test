// ===== NEON RUST REQUIEM — shared shader library (engine-provided) =====
#define PI 3.14159265
#define TAU 6.28318531
// Palette (linear RGB, HDR-friendly)
const vec3 C_VOID    = vec3(0.006, 0.003, 0.012);
const vec3 C_VIOLET  = vec3(0.090, 0.020, 0.160);
const vec3 C_MAGENTA = vec3(1.000, 0.050, 0.750);
const vec3 C_CYAN    = vec3(0.080, 0.950, 1.000);
const vec3 C_RUST    = vec3(0.750, 0.180, 0.040);
const vec3 C_BONE    = vec3(0.950, 0.880, 0.970);

float hash11(float p){ p=fract(p*0.1031); p*=p+33.33; p*=p+p; return fract(p); }
float hash12(vec2 p){ vec3 p3=fract(vec3(p.xyx)*0.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
vec2  hash22(vec2 p){ vec3 p3=fract(vec3(p.xyx)*vec3(0.1031,0.1030,0.0973)); p3+=dot(p3,p3.yzx+33.33); return fract((p3.xx+p3.yz)*p3.zy); }
vec3  hash33(vec3 p3){ p3=fract(p3*vec3(0.1031,0.1030,0.0973)); p3+=dot(p3,p3.yxz+33.33); return fract((p3.xxy+p3.yxx)*p3.zyx); }
// value noise, returns 0..1
float noise(vec3 p){
  vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  float n000=hash12(i.xy+i.z*17.13), n100=hash12(i.xy+vec2(1,0)+i.z*17.13);
  float n010=hash12(i.xy+vec2(0,1)+i.z*17.13), n110=hash12(i.xy+vec2(1,1)+i.z*17.13);
  float n001=hash12(i.xy+(i.z+1.0)*17.13), n101=hash12(i.xy+vec2(1,0)+(i.z+1.0)*17.13);
  float n011=hash12(i.xy+vec2(0,1)+(i.z+1.0)*17.13), n111=hash12(i.xy+vec2(1,1)+(i.z+1.0)*17.13);
  return mix(mix(mix(n000,n100,f.x),mix(n010,n110,f.x),f.y),mix(mix(n001,n101,f.x),mix(n011,n111,f.x),f.y),f.z);
}
// 5-octave fbm, returns ~0..1
float fbm(vec3 p){ float a=0.5, s=0.0; for(int i=0;i<5;i++){ s+=a*noise(p); p=p*2.03+vec3(1.7,9.2,4.1); a*=0.5; } return s/0.96875; }
mat2 rot(float a){ float c=cos(a), s=sin(a); return mat2(c,-s,s,c); }
float sdSphere(vec3 p,float r){ return length(p)-r; }
float sdBox(vec3 p,vec3 b){ vec3 q=abs(p)-b; return length(max(q,0.0))+min(max(q.x,max(q.y,q.z)),0.0); }
float sdRoundBox(vec3 p,vec3 b,float r){ return sdBox(p,b-r)-r; }
float sdTorus(vec3 p,vec2 t){ vec2 q=vec2(length(p.xz)-t.x,p.y); return length(q)-t.y; }
float sdCapsule(vec3 p,vec3 a,vec3 b,float r){ vec3 pa=p-a, ba=b-a; float h=clamp(dot(pa,ba)/dot(ba,ba),0.0,1.0); return length(pa-ba*h)-r; }
float sdCylinder(vec3 p,float h,float r){ vec2 d=abs(vec2(length(p.xz),p.y))-vec2(r,h); return min(max(d.x,d.y),0.0)+length(max(d,0.0)); }
float sdEllipsoid(vec3 p,vec3 r){ float k0=length(p/r); float k1=length(p/(r*r)); return k0*(k0-1.0)/k1; }
float smin(float a,float b,float k){ float h=clamp(0.5+0.5*(b-a)/k,0.0,1.0); return mix(b,a,h)-k*h*(1.0-h); }
float smax(float a,float b,float k){ return -smin(-a,-b,k); }
// iridescent cycle magenta -> cyan -> violet -> magenta, t any real
vec3 iridescent(float t){ t=fract(t); vec3 a=mix(C_MAGENTA,C_CYAN,smoothstep(0.0,0.4,t)); a=mix(a,vec3(0.45,0.2,1.0),smoothstep(0.4,0.7,t)); return mix(a,C_MAGENTA,smoothstep(0.7,1.0,t)); }
// sparse star field for a view direction; returns HDR brightness
float starfield(vec3 rd,float density){
  float s=0.0;
  for(int l=0;l<3;l++){
    float sc=120.0+float(l)*150.0;
    vec3 q=rd*sc; vec3 id=floor(q); vec3 h=hash33(id+float(l)*31.0);
    if(h.x<density){ vec3 c=id+0.2+0.6*h; float d=length(q-c); s+=pow(max(0.0,1.0-d*2.2),8.0)*(0.6+3.0*h.y*h.y); }
  }
  return s;
}
