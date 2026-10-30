import React from 'react';
import { loadFont } from '@remotion/fonts';
import { AbsoluteFill, CanvasImage, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';

void loadFont({family:'DM Sans',url:staticFile('fonts/dm-sans.woff2'),weight:'100 1000'});
void loadFont({family:'Instrument Serif',url:staticFile('fonts/instrument-serif.woff2')});
void loadFont({family:'DM Mono',url:staticFile('fonts/dm-mono.woff2')});

export const colors = { ink:'#132e26', muted:'#647369', paper:'#f7f5ee', mint:'#c7f7b2', line:'#d8ddd2', red:'#b15035', amber:'#dca746' };

export const Stage: React.FC<React.PropsWithChildren<{chapter:string;dark?:boolean}>> = ({chapter,dark=false,children}) => {
  const frame=useCurrentFrame();
  const {durationInFrames}=useVideoConfig();
  const opacity=interpolate(frame,[0,10,durationInFrames-8,durationInFrames-1],[0,1,1,0],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});
  return <AbsoluteFill style={{background:dark?colors.ink:colors.paper,color:dark?colors.paper:colors.ink,fontFamily:'DM Sans',overflow:'hidden'}}>
    <AbsoluteFill style={{opacity}}>
      <div style={{position:'absolute',left:96,top:56,display:'flex',gap:14,alignItems:'center',fontSize:32,fontWeight:650,letterSpacing:-1}}><span style={{width:36,height:36,border:'2px solid currentColor',borderRadius:12,display:'grid',placeItems:'center',fontSize:24}}>✓</span>payproof.</div>
      <div style={{position:'absolute',right:96,top:66,fontFamily:'DM Mono',fontSize:20,letterSpacing:2,textTransform:'uppercase',opacity:0.7}}>{chapter}</div>
      {children}
    </AbsoluteFill>
  </AbsoluteFill>;
};

export const Title: React.FC<React.PropsWithChildren<{top?:number;width?:number}>>=({children,top=144,width=1700})=><div style={{position:'absolute',left:96,top,width,fontSize:108,lineHeight:1.03,letterSpacing:-5,fontWeight:550}}>{children}</div>;

export const Screen: React.FC<{src:string;x:number;y:number;width:number;height:number;sourceWidth:number;scale?:number;cropX?:number;cropY?:number;label?:string}>=({src,x,y,width,height,sourceWidth,scale=1,cropX=0,cropY=0,label})=> <div style={{position:'absolute',left:x,top:y,width,height,borderRadius:24,overflow:'hidden',border:`1px solid ${colors.line}`,background:colors.paper,boxShadow:'0 16px 50px #132e2614'}}>
  <CanvasImage src={staticFile(`screens/${src}`)} style={{position:'absolute',left:-cropX*scale,top:-cropY*scale,width:sourceWidth*scale,maxWidth:'none'}} />
  {label?<div style={{position:'absolute',right:16,bottom:16,padding:'10px 16px',borderRadius:8,background:colors.ink,color:colors.paper,fontSize:20,fontFamily:'DM Mono'}}>{label}</div>:null}
</div>;

export const Pill: React.FC<React.PropsWithChildren<{x:number;y:number;amber?:boolean}>>=({children,x,y,amber=false})=><div style={{position:'absolute',left:x,top:y,padding:'15px 24px',borderRadius:99,background:amber?'#f6e4b8':colors.mint,color:colors.ink,fontSize:27,fontWeight:600}}>{children}</div>;

export const Metric: React.FC<{value:string;label:string;color?:string}>=({value,label,color})=><div style={{flex:1,padding:'30px 36px',border:`1px solid ${colors.line}`,borderRadius:24,background:'#ffffff'}}><div style={{fontFamily:'Instrument Serif',fontSize:154,lineHeight:1,color:color??colors.ink}}>{value}</div><div style={{fontSize:38,marginTop:15,color:colors.ink}}>{label}</div></div>;
