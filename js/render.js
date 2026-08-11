(function(root){
  'use strict';
  var RS=root.RS=root.RS||{},TAU=Math.PI*2;
  var PALETTES=[
    {bg0:'#050713',bg1:'#090a22',a:'#5beeff',b:'#865dff',c:'#ff5fcf'},
    {bg0:'#050a16',bg1:'#061b25',a:'#50f5ff',b:'#52a6ff',c:'#69ffd0'},
    {bg0:'#10070e',bg1:'#25100a',a:'#ffd05b',b:'#ff7a5e',c:'#ff5fcf'},
    {bg0:'#04100d',bg1:'#082118',a:'#64ffc7',b:'#59efff',c:'#b7ff6c'},
    {bg0:'#0c0615',bg1:'#180822',a:'#c77dff',b:'#ff5fcf',c:'#73eaff'}
  ];
  var C={ship:'#f8ffff',mine:'#ff5d7c',mineWarn:'#ffb24d',shard:'#69ffd0',comet:'#74a7ff',gold:'#ffd05b'};

  function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
  function lerp(a,b,t){return a+(b-a)*t;}
  function ease(t){return 1-Math.pow(1-clamp(t,0,1),3);}
  function hs(hex,alpha){
    var h=hex.replace('#',''),n=parseInt(h,16);
    return 'rgba('+((n>>16)&255)+','+((n>>8)&255)+','+(n&255)+','+alpha+')';
  }

  RS.createRenderer=function(canvas){
    var ctx=canvas.getContext('2d',{alpha:false,desynchronized:true});
    var r={arena:{cx:0,cy:0,R:100},vw:1,vh:1,dpr:1};
    var stars=[],dust=[],particles=[],shock=[],floaters=[],trail=[],debris=[];
    var MAXP=170,lastStage=-1,bgGrad=null,vignette=null;

    function rebuildStars(){
      var count=Math.min(110,Math.max(34,Math.round(r.vw*r.vh/11000)));
      stars.length=0;
      for(var i=0;i<count;i++)stars.push({x:Math.random(),y:Math.random(),z:.25+Math.random()*.75,s:.6+Math.random()*1.7,p:Math.random()*TAU});
      dust.length=0;
      for(var j=0;j<18;j++)dust.push({a:Math.random()*TAU,rad:.45+Math.random()*1.2,s:.5+Math.random()*1.2,p:Math.random()*TAU});
    }
    function rebuildGrad(pal){
      bgGrad=ctx.createRadialGradient(r.vw*.5,r.vh*.50,0,r.vw*.5,r.vh*.50,Math.max(r.vw,r.vh)*.72);
      bgGrad.addColorStop(0,pal.bg1);bgGrad.addColorStop(.68,pal.bg0);bgGrad.addColorStop(1,'#02030a');
      vignette=ctx.createRadialGradient(r.vw*.5,r.vh*.5,Math.min(r.vw,r.vh)*.15,r.vw*.5,r.vh*.5,Math.max(r.vw,r.vh)*.7);
      vignette.addColorStop(.3,'rgba(0,0,0,0)');vignette.addColorStop(1,'rgba(0,0,0,.46)');
    }

    r.resize=function(){
      var vw=Math.max(1,root.innerWidth||canvas.clientWidth||1),vh=Math.max(1,root.innerHeight||canvas.clientHeight||1);
      var dpr=Math.min(Math.max(root.devicePixelRatio||1,1),2.25);
      r.vw=vw;r.vh=vh;r.dpr=dpr;
      canvas.width=Math.max(1,Math.round(vw*dpr));canvas.height=Math.max(1,Math.round(vh*dpr));
      canvas.style.width=vw+'px';canvas.style.height=vh+'px';
      ctx.setTransform(dpr,0,0,dpr,0,0);
      var portrait=vh>=vw;
      r.arena.R=portrait?Math.min(vw*.39,vh*.31):Math.min(vh*.38,vw*.27);
      r.arena.R=Math.max(55,r.arena.R);
      r.arena.cx=vw*.5;r.arena.cy=portrait?vh*.54:vh*.52;
      rebuildStars();lastStage=-1;
    };

    function pos(rad,angle){return{x:r.arena.cx+Math.cos(angle)*r.arena.R*rad,y:r.arena.cy+Math.sin(angle)*r.arena.R*rad};}
    function shipRad(ship){
      if(!ship.hop.active)return RS.GAME_C.RING_R[ship.ring];
      return lerp(RS.GAME_C.RING_R[ship.hop.from],RS.GAME_C.RING_R[ship.hop.to],ease(ship.hop.t));
    }
    function glowDot(x,y,rr,color,a){
      var g=ctx.createRadialGradient(x,y,0,x,y,rr*2.8);g.addColorStop(0,hs(color,a));g.addColorStop(.25,hs(color,a*.45));g.addColorStop(1,hs(color,0));
      ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,rr*2.8,0,TAU);ctx.fill();
    }

    function drawBackdrop(t,pal,overdrive,reduced){
      if(lastStage!==pal){rebuildGrad(pal);lastStage=pal;}
      ctx.fillStyle=bgGrad;ctx.fillRect(0,0,r.vw,r.vh);

      // Large moving aurora ribbons: cheap gradients with strong depth.
      ctx.save();ctx.globalCompositeOperation='screen';
      for(var q=0;q<3;q++){
        var x=r.vw*(.18+.36*q)+Math.sin(t*.08+q*2)*r.vw*.08;
        var y=r.vh*(.24+.18*q)+Math.cos(t*.1+q)*r.vh*.05;
        var rad=Math.max(r.vw,r.vh)*(.32+.06*q);
        var ag=ctx.createRadialGradient(x,y,0,x,y,rad);
        var col=q===0?pal.a:q===1?pal.b:pal.c;
        ag.addColorStop(0,hs(col,overdrive?.085:.04));ag.addColorStop(.48,hs(col,.018));ag.addColorStop(1,hs(col,0));
        ctx.fillStyle=ag;ctx.fillRect(0,0,r.vw,r.vh);
      }
      ctx.restore();

      for(var i=0;i<stars.length;i++){
        var s=stars[i],tw=reduced?.55:.35+.45*(.5+.5*Math.sin(t*(.45+s.z)+s.p));
        var yy=(s.y*r.vh+(reduced?0:t*4*s.z))%(r.vh+6)-3;
        ctx.globalAlpha=tw;ctx.fillStyle=s.z>.7?pal.a:'#c9d7ff';
        ctx.beginPath();ctx.arc(s.x*r.vw,yy,s.s*s.z,0,TAU);ctx.fill();
      }
      ctx.globalAlpha=1;

      if(overdrive&&!reduced){
        ctx.save();ctx.globalCompositeOperation='screen';ctx.strokeStyle=hs(pal.a,.18);ctx.lineWidth=1;
        for(var j=0;j<18;j++){
          var a=(j/18)*TAU+t*.22,rr=r.arena.R*(1.2+((t*.38+j*.073)%1)*1.35);
          var p=pos(rr/r.arena.R,a);ctx.beginPath();ctx.moveTo(r.arena.cx,r.arena.cy);ctx.lineTo(p.x,p.y);ctx.stroke();
        }
        ctx.restore();
      }
    }

    function drawArena(t,pal,overdrive,reduced){
      var R=r.arena.R;
      // floor / halo
      ctx.save();ctx.translate(r.arena.cx,r.arena.cy);
      ctx.scale(1,.40);
      var fg=ctx.createRadialGradient(0,0,R*.18,0,0,R*1.32);
      fg.addColorStop(0,hs(pal.a,overdrive?.18:.09));fg.addColorStop(.55,hs(pal.b,.045));fg.addColorStop(1,hs(pal.b,0));
      ctx.fillStyle=fg;ctx.beginPath();ctx.arc(0,0,R*1.4,0,TAU);ctx.fill();ctx.restore();

      // rings, tick marks and energy arcs
      for(var k=0;k<2;k++){
        var rad=R*RS.GAME_C.RING_R[k];
        ctx.save();
        ctx.strokeStyle=hs('#aec8ff',.16);ctx.lineWidth=Math.max(1.5,R*.010);
        ctx.beginPath();ctx.arc(r.arena.cx,r.arena.cy,rad,0,TAU);ctx.stroke();
        ctx.strokeStyle=hs(k?pal.a:pal.b,overdrive?.78:.48);ctx.lineWidth=Math.max(2,R*.014);
        ctx.shadowColor=k?pal.a:pal.b;ctx.shadowBlur=overdrive?18:8;
        var off=t*(k?.27:-.34);
        for(var seg=0;seg<3;seg++){
          var a0=off+seg*TAU/3;ctx.beginPath();ctx.arc(r.arena.cx,r.arena.cy,rad,a0,a0+.40);ctx.stroke();
        }
        ctx.shadowBlur=0;ctx.strokeStyle=hs('#dbe7ff',.10);ctx.lineWidth=1;
        for(var tick=0;tick<24;tick++){
          var a=tick*TAU/24,aa=rad-3,bb=rad+3;
          ctx.beginPath();ctx.moveTo(r.arena.cx+Math.cos(a)*aa,r.arena.cy+Math.sin(a)*aa);ctx.lineTo(r.arena.cx+Math.cos(a)*bb,r.arena.cy+Math.sin(a)*bb);ctx.stroke();
        }
        ctx.restore();
      }

      // central reactor
      var pulse=reduced?1:1+.035*Math.sin(t*2.5);
      glowDot(r.arena.cx,r.arena.cy,R*.20*pulse,pal.a,overdrive?.55:.32);
      ctx.save();ctx.translate(r.arena.cx,r.arena.cy);ctx.rotate(t*.18);
      for(var n=0;n<3;n++){
        ctx.strokeStyle=hs(n===0?pal.a:n===1?pal.b:pal.c,.46-n*.08);
        ctx.lineWidth=1.5;ctx.setLineDash([R*.08,R*.07]);ctx.lineDashOffset=t*(n%2?16:-12);
        ctx.beginPath();ctx.arc(0,0,R*(.15+n*.045),0,TAU);ctx.stroke();
      }
      ctx.restore();
      ctx.fillStyle='#eefeff';ctx.beginPath();ctx.arc(r.arena.cx,r.arena.cy,R*.045,0,TAU);ctx.fill();
    }

    function drawMine(e,t,pal){
      var p=pos(RS.GAME_C.RING_R[e.ring],e.angle),z=r.arena.R*RS.GAME_C.MINE_R;
      ctx.save();ctx.translate(p.x,p.y);ctx.rotate(t*.55+e.angle);
      if(!e.armed){
        var k=clamp(e.age/RS.GAME_C.MINE_TELEGRAPH,0,1);
        ctx.globalAlpha=.35+.45*k;ctx.strokeStyle=C.mineWarn;ctx.lineWidth=2;ctx.setLineDash([4,4]);
        ctx.beginPath();ctx.arc(0,0,z*(2.2-1.05*k),0,TAU);ctx.stroke();ctx.setLineDash([]);
      }
      ctx.globalAlpha=e.armed?1:.55;ctx.fillStyle=e.armed?C.mine:'#a85c63';ctx.shadowColor=C.mine;ctx.shadowBlur=e.armed?15:0;
      ctx.beginPath();
      for(var i=0;i<16;i++){var a=i*TAU/16,rr=i%2===0?z*1.25:z*.64;var x=Math.cos(a)*rr,y=Math.sin(a)*rr;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}
      ctx.closePath();ctx.fill();
      ctx.shadowBlur=0;ctx.fillStyle='#310b16';ctx.beginPath();ctx.arc(0,0,z*.34,0,TAU);ctx.fill();
      ctx.fillStyle='#ffb1bd';ctx.beginPath();ctx.arc(-z*.12,-z*.12,z*.10,0,TAU);ctx.fill();
      ctx.restore();ctx.globalAlpha=1;
    }

    function drawShard(e,t,pal){
      var p=pos(RS.GAME_C.RING_R[e.ring],e.angle),z=r.arena.R*RS.GAME_C.SHARD_R*(1+.08*Math.sin(t*4+e.angle));
      ctx.save();ctx.translate(p.x,p.y);ctx.rotate(Math.PI/4+t*.5);
      ctx.shadowColor=C.shard;ctx.shadowBlur=18;ctx.fillStyle=C.shard;ctx.fillRect(-z*.56,-z*.56,z*1.12,z*1.12);
      ctx.shadowBlur=0;ctx.strokeStyle='#eafff8';ctx.globalAlpha=.7;ctx.strokeRect(-z*.39,-z*.39,z*.78,z*.78);
      ctx.restore();ctx.globalAlpha=1;
      glowDot(p.x,p.y,z*1.2,C.shard,.24);
    }

    function drawComet(e,t,pal){
      var p=pos(RS.GAME_C.RING_R[e.ring],e.angle),z=r.arena.R*RS.GAME_C.COMET_R;
      var dir=e.vel>0?-1:1;
      ctx.save();ctx.globalCompositeOperation='screen';
      for(var i=11;i>=1;i--){
        var a=e.angle+dir*i*.043,tp=pos(RS.GAME_C.RING_R[e.ring],a);
        ctx.globalAlpha=.035*(12-i);ctx.fillStyle=pal.a;ctx.beginPath();ctx.arc(tp.x,tp.y,z*(.35+i/18),0,TAU);ctx.fill();
      }
      ctx.restore();
      glowDot(p.x,p.y,z*1.3,C.comet,.4);
      ctx.fillStyle='#e4efff';ctx.beginPath();ctx.arc(p.x,p.y,z*.72,0,TAU);ctx.fill();
      ctx.strokeStyle=C.comet;ctx.lineWidth=2;ctx.beginPath();ctx.arc(p.x,p.y,z,0,TAU);ctx.stroke();
    }

    function drawShip(g,t,pal,reduced){
      var rr=shipRad(g.ship),p=pos(rr,g.ship.angle),size=r.arena.R*RS.GAME_C.SHIP_R*2.2;
      trail.push({x:p.x,y:p.y,a:1});
      if(trail.length>22)trail.shift();
      ctx.save();ctx.globalCompositeOperation='screen';
      for(var i=0;i<trail.length;i++){
        var q=trail[i],k=(i+1)/trail.length;ctx.globalAlpha=.24*k*(g.overdrive?1.8:1);ctx.fillStyle=g.overdrive?C.gold:pal.a;ctx.beginPath();ctx.arc(q.x,q.y,size*.18*k,0,TAU);ctx.fill();
      }
      ctx.restore();
      var heading=g.ship.angle+g.ship.dir*Math.PI/2;
      ctx.save();ctx.translate(p.x,p.y);ctx.rotate(heading);
      ctx.shadowColor=g.overdrive?C.gold:pal.a;ctx.shadowBlur=g.overdrive?26:18;
      var grad=ctx.createLinearGradient(-size,0,size,0);grad.addColorStop(0,pal.b);grad.addColorStop(.55,'#f7ffff');grad.addColorStop(1,g.overdrive?C.gold:pal.a);
      ctx.fillStyle=grad;ctx.beginPath();ctx.moveTo(size,0);ctx.lineTo(-size*.68,size*.48);ctx.lineTo(-size*.28,0);ctx.lineTo(-size*.68,-size*.48);ctx.closePath();ctx.fill();
      ctx.shadowBlur=0;ctx.fillStyle='#071323';ctx.beginPath();ctx.moveTo(size*.30,0);ctx.lineTo(-size*.22,size*.18);ctx.lineTo(-size*.22,-size*.18);ctx.closePath();ctx.fill();
      ctx.restore();
      if(g.ship.hop.active&&!reduced){
        ctx.strokeStyle=hs(pal.a,.30);ctx.lineWidth=2;ctx.beginPath();ctx.arc(p.x,p.y,size*(1.2+g.ship.hop.t),0,TAU);ctx.stroke();
      }
      return p;
    }

    function spawnBurst(x,y,color,n,power){
      for(var i=0;i<n;i++){
        if(particles.length>=MAXP)particles.shift();
        var a=Math.random()*TAU,v=(35+Math.random()*140)*(power||1);
        particles.push({x:x,y:y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,life:1,decay:1.0+Math.random()*1.35,s:1.1+Math.random()*2.5,c:color});
      }
    }
    function updateFx(dt){
      for(var i=particles.length-1;i>=0;i--){var p=particles[i];p.life-=p.decay*dt;if(p.life<=0){particles.splice(i,1);continue;}p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=.985;p.vy*=.985;}
      for(var j=shock.length-1;j>=0;j--){shock[j].life-=dt;if(shock[j].life<=0)shock.splice(j,1);}
      for(var k=floaters.length-1;k>=0;k--){floaters[k].life-=dt;if(floaters[k].life<=0)floaters.splice(k,1);}
    }
    function drawFx(){
      ctx.save();ctx.globalCompositeOperation='screen';
      for(var i=0;i<particles.length;i++){var p=particles[i];ctx.globalAlpha=clamp(p.life,0,1);ctx.fillStyle=p.c;ctx.beginPath();ctx.arc(p.x,p.y,p.s*clamp(p.life,0,1),0,TAU);ctx.fill();}
      for(var j=0;j<shock.length;j++){var s=shock[j],k=1-s.life/s.max;ctx.globalAlpha=s.life/s.max;ctx.strokeStyle=s.c;ctx.lineWidth=2.5*(1-k);ctx.beginPath();ctx.arc(s.x,s.y,lerp(8,s.r,k),0,TAU);ctx.stroke();}
      ctx.restore();ctx.globalAlpha=1;
      for(var f=0;f<floaters.length;f++){var o=floaters[f],k=o.life/o.max;ctx.globalAlpha=clamp(k,0,1);ctx.fillStyle=o.c;ctx.textAlign='center';ctx.font='900 italic '+Math.round(o.size)+'px system-ui,sans-serif';ctx.fillText(o.text,o.x,o.y-(1-k)*32);}
      ctx.globalAlpha=1;
    }

    r.onEvent=function(ev,g){
      var pal=PALETTES[(g&&g.stage)||0],sp=g?pos(shipRad(g.ship),g.ship.angle):{x:r.arena.cx,y:r.arena.cy};
      if(ev.type==='hop')spawnBurst(sp.x,sp.y,pal.a,6,.55);
      if(ev.type==='shard'){spawnBurst(sp.x,sp.y,C.shard,14,1);floaters.push({x:sp.x,y:sp.y-20,text:'CHAIN ×'+ev.combo,c:C.shard,size:15,life:.7,max:.7});}
      if(ev.type==='nearmiss'){spawnBurst(sp.x,sp.y,C.gold,10,.8);floaters.push({x:sp.x,y:sp.y-18,text:'CLOSE CALL',c:C.gold,size:15,life:.65,max:.65});}
      if(ev.type==='precision'){spawnBurst(sp.x,sp.y,pal.a,22,1.2);shock.push({x:sp.x,y:sp.y,r:r.arena.R*.42,life:.48,max:.48,c:pal.a});floaters.push({x:sp.x,y:sp.y-22,text:'PERFECT SHIFT',c:'#ffffff',size:18,life:.8,max:.8});}
      if(ev.type==='overdrive-start'){spawnBurst(r.arena.cx,r.arena.cy,C.gold,44,1.7);shock.push({x:r.arena.cx,y:r.arena.cy,r:r.arena.R*1.5,life:.9,max:.9,c:C.gold});}
      if(ev.type==='milestone')shock.push({x:r.arena.cx,y:r.arena.cy,r:r.arena.R*1.25,life:.55,max:.55,c:pal.b});
      if(ev.type==='death'){spawnBurst(sp.x,sp.y,C.mine,48,2.0);shock.push({x:sp.x,y:sp.y,r:r.arena.R*.9,life:.72,max:.72,c:C.mine});}
    };
    r.clearFx=function(){particles.length=0;shock.length=0;floaters.length=0;trail.length=0;debris.length=0;};
    r.shipPos=function(g){return pos(shipRad(g.ship),g.ship.angle);};

    r.draw=function(g,fx){
      fx=fx||{};var t=fx.t||0,dt=fx.dt||0,pal=PALETTES[g?g.stage:0]||PALETTES[0],reduced=!!fx.reducedMotion;
      ctx.save();
      drawBackdrop(t,pal,g&&g.overdrive,reduced);
      if(fx.shake>0&&!reduced){ctx.translate((Math.random()*2-1)*8*fx.shake,(Math.random()*2-1)*8*fx.shake);}
      drawArena(t,pal,g&&g.overdrive,reduced);

      if(g){
        for(var i=0;i<g.entities.length;i++){var e=g.entities[i];if(e.kind==='mine')drawMine(e,t,pal);else if(e.kind==='shard')drawShard(e,t,pal);else drawComet(e,t,pal);}
        drawShip(g,t,pal,reduced);
      }else{
        // Menu attract scene, intentionally uses the exact gameplay art system.
        var ghost={overdrive:false,ship:{ring:1,angle:t*.55-Math.PI/2,dir:1,hop:{active:false}}};
        drawShip(ghost,t,pal,reduced);
        var demoShard={ring:0,angle:t*.55+.8,age:1};drawShard(demoShard,t,pal);
        var demoMine={ring:1,angle:t*.55+1.65,age:1,armed:true};drawMine(demoMine,t,pal);
      }

      updateFx(dt);drawFx();
      if(vignette){ctx.fillStyle=vignette;ctx.fillRect(0,0,r.vw,r.vh);}
      ctx.restore();
    };
    r.resize();
    return r;
  };
})(typeof window!=='undefined'?window:globalThis);