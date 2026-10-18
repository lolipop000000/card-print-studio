// Kernels use straight byte color, with explicit premultiplication only for
// sampling/compositing. CPU fallback remains the behavioral reference.
export const simpleShaders={
 colorAdjust:`void main(){ivec2 p=ivec2(gl_FragCoord.xy);vec4 v=original(p);if(v.a>0.){vec3 c=vec3(dot(v.rgb,u0.xyz),dot(v.rgb,u1.xyz),dot(v.rgb,u2.xyz));float light=dot(c,vec3(.2126,.7152,.0722));v.rgb=(light+(c-light)*u3.x)*u3.y;}result=bytes(v);}`,
 posterize:`void main(){vec4 v=original(ivec2(gl_FragCoord.xy));if(v.a>0.)v.rgb=floor(v.rgb*u0.x/255.+.5)*255./u0.x;result=bytes(v);}`,
 halftone:`void main(){ivec2 p=ivec2(gl_FragCoord.xy);vec4 v=original(p);vec2 pos=vec2(p)+.5+u0.yz;vec2 uv=vec2(pos.x*u1.x+pos.y*u1.y,-pos.x*u1.y+pos.y*u1.x)/u0.x;vec2 q=(fract(uv)-.5)*u0.x;float radius=u0.x*.5*sqrt(max(0.,1.-dot(v.rgb,vec3(.2126,.7152,.0722))/255.));v.a*=clamp(radius+.5-length(q),0.,1.);result=bytes(v);}`,
 duotone:`void main(){vec4 v=original(ivec2(gl_FragCoord.xy));if(v.a>0.){float light=dot(v.rgb,vec3(.2126,.7152,.0722))/255.;v.rgb=mix(v.rgb,mix(u0.rgb,u1.rgb,light),u0.a);}result=bytes(v);}`,
 scanlines:`void main(){ivec2 p=ivec2(gl_FragCoord.xy);vec4 v=original(p);vec2 pos=(vec2(p)+.5)/u0.x+u1.xy;float axis=(-pos.x*u0.z+pos.y*u0.y)/u1.z+u1.w,edge=abs(fract(axis+.5)-.5)*u1.z;float coverage=u2.x>=u1.z?1.:clamp((min(u1.z,u2.x)*.5-edge)/u2.y+.5,0.,1.);if(v.a>0.)v.rgb=mix(v.rgb,u3.rgb,coverage*u2.z);result=bytes(v);}`,
 grain:`uint hash(ivec2 p){uint key=(uint(u2.x)<<16)|uint(u2.y);uint h=uint(p.x)*0x1f123bb5u^uint(p.y)*0x5f356495u^key;h^=h>>16;h*=0x7feb352du;h^=h>>15;h*=0x846ca68bu;h^=h>>16;return h;}
 float noise(ivec2 p){return float(hash(p))/4294967296.;}
 void main(){ivec2 p=ivec2(gl_FragCoord.xy);vec4 v=original(p);if(v.a>0.){vec2 x=texelFetch(auxiliary,ivec2(p.x,0),0).rg,y=texelFetch(auxiliary,ivec2(p.y,0),0).ba;ivec2 a=ivec2(x.x,y.x);vec2 f=vec2(x.y,y.y);float n=mix(mix(noise(a),noise(a+ivec2(1,0)),f.x),mix(noise(a+ivec2(0,1)),noise(a+ivec2(1)),f.x),f.y),value=(n*2.-1.)*100.*u1.z;v.rgb+=value;}result=bytes(v);}`,
 directionalBlur:`void main(){vec2 p=floor(gl_FragCoord.xy);vec4 base=premul(original(ivec2(p))),sum=vec4(0.);int count=int(u0.w);for(int i=0;i<count;i++){vec2 shift=(float(i)/float(count-1)-.5)*u0.xy;sum+=sampleAt(p-shift);}result=bytes(unassociate(base*(1.-u0.z)+sum*(u0.z/float(count))));}`,
 displacement:`void main(){ivec2 p=ivec2(gl_FragCoord.xy);vec2 shift=vec2(texelFetch(auxiliary,ivec2(p.y,0),0).r,texelFetch(auxiliary,ivec2(p.x,0),0).g);result=bytes(unassociate(sampleAt(vec2(p)-shift)));}`,
 glitch:`void main(){ivec2 p=ivec2(gl_FragCoord.xy);float shift=texelFetch(auxiliary,ivec2(p.y,0),0).r;result=bytes(unassociate(sampleAt(vec2(float(p.x)+shift,float(p.y)))));}`,
 chromatic:`void main(){ivec2 p=ivec2(gl_FragCoord.xy);vec4 v=original(p),red=sampleAt(vec2(p)-u0.xy),blue=sampleAt(vec2(p)+u0.xy);float strength=u0.z;
 float greenOrBlack=(v.g>0.||(v.r==0.&&v.b==0.))?v.a:0.,split=max(max(red.r>0.?red.a:0.,greenOrBlack),blue.b>0.?blue.a:0.),alpha=v.a*(1.-strength)+split*strength;
 if(alpha<=0.){result=vec4(0.);return;}result=bytes(vec4((v.r*v.a*(1.-strength)+red.r*255.*strength)/alpha,v.g*v.a/alpha,(v.b*v.a*(1.-strength)+blue.b*255.*strength)/alpha,alpha));}`,
 extrude:`void main(){ivec2 p=ivec2(gl_FragCoord.xy);vec4 v=original(p);float side=0.,progress=0.;int steps=int(u0.z);for(int j=1;j<=steps;j++){float t=float(j)/float(steps),alpha=sampleAt(vec2(p)-u0.xy*t).a/255.;if(alpha>side){side=alpha;progress=t;}}
 float front=v.a/255.,back=side*u0.w*(1.-front),alpha=front+back;if(back>0.)v=vec4((v.rgb*front+u1.rgb*(1.-progress*.14)*back)/alpha,alpha*255.);result=bytes(v);}`,
 reflective:`float cycle(float x){int i=int(floor(fract(x)*2048.));return texelFetch(auxiliary,ivec2(i,0),0).a;}
 vec3 table(float x){return texelFetch(auxiliary,ivec2(int(floor(fract(x)*2048.)),0),0).rgb;}
 void main(){ivec2 p=ivec2(gl_FragCoord.xy);vec4 v=original(p);if(v.a<=0.){result=vec4(0.);return;}vec2 pos=u0.xy+vec2(p)/u0.z;float u=pos.x*u1.x+pos.y*u1.y,z=-pos.x*u1.y+pos.y*u1.x,light=dot(v.rgb,vec3(.2126,.7152,.0722))/255.,size=u0.w,time=u1.z,phase=u1.w;
 if(u2.y>0.){float band=fract(u/size+phase+.045*cycle(z/(size*2.))+time*.17),groove=.95+.05*cycle((z+u*.08)/.19),shade=(.66+.45*light)*groove;v.rgb=mix(v.rgb,table(band)*shade,u2.x);}
 else{float interference=u/size+.19*cycle(z/(size*.72)+phase)+phase+time*.13,wave=.5+.5*cycle((u-z*.65)/size*1.7+phase-time*.11),shine=max(0.,cycle((u*.61+z)/size*1.55+phase+time*.16)),square=shine*shine,flash=square*square*square*square*.82,shade=(.44+.6*wave)*(.64+.36*light);vec3 color=table(interference)*shade;v.rgb=mix(v.rgb,mix(color,vec3(255.),flash),u2.x);}result=bytes(v);}`
};

export const distanceHorizontal=`void main(){ivec2 p=ivec2(gl_FragCoord.xy);int radius=int(u0.x);float best=float(min((p.x+1)*(p.x+1),(size.x-p.x)*(size.x-p.x)));best=min(best,float(radius*radius));for(int x=-radius;x<=radius;x++){if(original(p+ivec2(x,0)).a==0.)best=min(best,float(x*x));}result=vec4(best/255.,0.,0.,1.);}`;
export const distanceVertical=`void main(){ivec2 p=ivec2(gl_FragCoord.xy);int radius=int(u0.x);float best=min(float(min((p.y+1)*(p.y+1),(size.y-p.y)*(size.y-p.y))),get(p).r);for(int y=-radius;y<=radius;y++){int row=p.y+y;if(row>=0&&row<size.y)best=min(best,get(ivec2(p.x,row)).r+float(y*y));}result=vec4(sqrt(best)/255.,0.,0.,1.);}`;
export const distanceShaders={
 innerGlow:`void main(){ivec2 p=ivec2(gl_FragCoord.xy);vec4 v=original(p);if(v.a>0.)v.rgb=mix(v.rgb,u1.rgb,inward(get(p).r,u0.x,true)*u0.y);result=bytes(v);}`,
 bevel:`void main(){ivec2 p=ivec2(gl_FragCoord.xy);vec4 v=original(p);float edge=inward(get(p).r,u0.x,false);if(v.a>0.&&edge>0.){vec2 gradient=vec2(get(p+ivec2(1,0)).r-get(p-ivec2(1,0)).r,get(p+ivec2(0,1)).r-get(p-ivec2(0,1)).r);float len=length(gradient),shade=len>1e-5?-dot(gradient,u0.zw)/len:.16;v.rgb=mix(v.rgb,shade>=0.?u1.rgb:u2.rgb,abs(shade)*edge*u0.y);}result=bytes(v);}`,
 erode:`void main(){ivec2 p=ivec2(gl_FragCoord.xy);vec4 v=original(p);float rough=u0.y,noise=.5;if(rough>0.){vec2 pos=(u1.xy+(vec2(p)+.5)/u1.z)/u0.z-u2.xy;ivec2 a=ivec2(floor(pos));vec2 f=pos-vec2(a);noise=mix(mix(texelFetch(auxiliary,a,0).r,texelFetch(auxiliary,a+ivec2(1,0),0).r,f.x),mix(texelFetch(auxiliary,a+ivec2(0,1),0).r,texelFetch(auxiliary,a+ivec2(1),0).r,f.x),f.y);}v.a*=clamp(get(p).r-u0.x*(1.+rough*(noise-.5)*1.5),0.,1.);result=bytes(v);}`
};
export const outlineBase=`void main(){result=vec4(original(ivec2(gl_FragCoord.xy)).a/255.,0.,0.,1.);}`;
export const outlineRange=`void main(){ivec2 p=ivec2(gl_FragCoord.xy);result=vec4(max(get(p).r,get(p+ivec2(int(u0.x),0)).r)/255.,0.,0.,1.);}`;
export const outlineFinish=`float rangeMax(int left,int right,int y){left=max(left,0);right=min(right,size.x-1);if(left>right||y<0||y>=size.y)return 0.;int level=int(floor(log2(float(right-left+1))));int span=1<<level;return max(texelFetch(pyramid,ivec3(left,y,level),0).r,texelFetch(pyramid,ivec3(right-span+1,y,level),0).r)*255.;}
 void main(){ivec2 p=ivec2(gl_FragCoord.xy);float radius=u0.x,extent=radius+1.,dilated=0.;int limit=min(size.y-1,int(ceil(extent))-1);for(int dy=-limit;dy<=limit;dy++){int row=p.y+dy;if(row<0||row>=size.y)continue;int full=abs(float(dy))<=radius?min(size.x-1,int(floor(sqrt(max(0.,radius*radius-float(dy*dy)))))):-1;
 if(full>=0)dilated=max(dilated,rangeMax(p.x-full,p.x+full,row));int outer=min(size.x-1,int(ceil(sqrt(max(0.,extent*extent-float(dy*dy)))))-1);for(int dx=full+1;dx<=outer;dx++){float weight=clamp(extent-length(vec2(dx,dy)),0.,1.);dilated=max(dilated,max(original(ivec2(p.x-dx,row)).a,original(ivec2(p.x+dx,row)).a)*weight);}}
 vec4 v=original(p);float alpha=max(v.a,floor(dilated+.5)),added=alpha-v.a;if(added>0.)v=vec4((v.rgb*v.a+u1.rgb*added)/alpha,alpha);result=bytes(v);}`;

export const alphaBase=`void main(){float alpha=original(ivec2(gl_FragCoord.xy)).a/255.;result=vec4(alpha/255.,0.,0.,1.);}`;
export const alphaBlur=`void main(){ivec2 p=ivec2(gl_FragCoord.xy),axis=ivec2(u0.yz);int radius=int(floor(u0.x));float fraction=u0.x-float(radius),sum=0.;for(int j=-radius;j<=radius;j++)sum+=get(p+axis*j).r;if(fraction>0.)sum+=(get(p-axis*(radius+1)).r+get(p+axis*(radius+1)).r)*fraction;result=vec4(sum/(float(2*radius+1)+2.*fraction)/255.,0.,0.,1.);}`;
export const innerShadowFinish=`float at(ivec2 p){return get(p).r;}
 void main(){ivec2 p=ivec2(gl_FragCoord.xy);vec4 v=original(p);vec2 pos=vec2(p)-u0.xy;ivec2 a=ivec2(floor(pos));vec2 f=pos-vec2(a);float alpha=mix(mix(at(a),at(a+ivec2(1,0)),f.x),mix(at(a+ivec2(0,1)),at(a+ivec2(1)),f.x),f.y),edge=clamp(1.-alpha,0.,1.);if(v.a>0.)v.rgb=mix(v.rgb,u1.rgb,edge*u0.z);result=bytes(v);}`;
