(function(root){
  'use strict';
  var RS=root.RS=root.RS||{};
  var TAU=Math.PI*2;
  var C={
    RING_R:[.60,.96],SHIP_R:.052,MINE_R:.064,COMET_R:.056,SHARD_R:.045,
    HOP_TIME:.115,OMEGA_START:1.18,OMEGA_MAX:2.82,OMEGA_RAMP:95,
    SPAWN_START:1.45,SPAWN_MIN:.58,SPAWN_RAMP:105,
    MINE_TELEGRAPH:.84,MINE_LIFE:2.8,COMET_LIFE:3.8,SHARD_LIFE:3.2,
    COMBO_MAX:8,COMBO_DECAY:5.25,FLOW_MAX:100,FLOW_DECAY:1.5,
    SHARD_FLOW:19,NEAR_FLOW:11,PRECISION_FLOW:19,OVERDRIVE_TIME:6.0,
    SHARD_PTS:80,NEAR_PTS:45,PRECISION_PTS:110,TIME_PTS:18,
    NEAR_MISS_ANG:.145,PRECISION_WINDOW:.36
  };
  RS.GAME_C=C;
  function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
  function ad(a,b){var d=Math.abs(a-b)%TAU;return d>Math.PI?TAU-d:d;}
  function pick(rng,a){return a[Math.floor(rng()*a.length)];}

  RS.createGame=function(opts){
    opts=opts||{};var rng=opts.rng||Math.random;
    var bonus=0,spawnTimer=.35,comboTimer=0,lastHopAt=-99,lastMilestone=0;
    var g={
      state:'running',time:0,entities:[],events:[],
      shards:0,nearMisses:0,precisionDodges:0,multiplier:1,bestCombo:1,
      flow:0,overdrive:false,overdriveLeft:0,stage:0,
      ship:{ring:1,angle:-Math.PI/2,dir:1,hop:{active:false,from:1,to:0,t:0}}
    };

    Object.defineProperty(g,'score',{get:function(){
      return Math.max(0,Math.floor(g.time*C.TIME_PTS+bonus));
    }});
    g.omega=function(){var k=clamp(g.time/C.OMEGA_RAMP,0,1);return C.OMEGA_START+(C.OMEGA_MAX-C.OMEGA_START)*k+(g.overdrive?.08:0);};
    g.spawnInterval=function(){var k=clamp(g.time/C.SPAWN_RAMP,0,1);return C.SPAWN_START-(C.SPAWN_START-C.SPAWN_MIN)*k;};
    g.effectiveRing=function(){
      var h=g.ship.hop;if(!h.active)return g.ship.ring;
      return h.t<.5?h.from:h.to;
    };
    function score(v){bonus+=v*g.multiplier*(g.overdrive?2:1);}
    function raiseCombo(){
      comboTimer=0;
      if(g.multiplier<C.COMBO_MAX){g.multiplier++;g.bestCombo=Math.max(g.bestCombo,g.multiplier);g.events.push({type:'combo-up',value:g.multiplier});}
    }
    function addFlow(v){
      if(g.overdrive)return;
      var before=g.flow;g.flow=clamp(g.flow+v,0,C.FLOW_MAX);
      if(before<C.FLOW_MAX&&g.flow>=C.FLOW_MAX){
        g.overdrive=true;g.overdriveLeft=C.OVERDRIVE_TIME;g.flow=C.FLOW_MAX;
        g.events.push({type:'overdrive-start',seconds:C.OVERDRIVE_TIME});
      }
    }
    g.hop=function(){
      if(g.state!=='running')return false;
      var h=g.ship.hop;if(h.active)return false;
      h.active=true;h.from=g.ship.ring;h.to=g.ship.ring===1?0:1;h.t=0;
      lastHopAt=g.time;g.events.push({type:'hop',to:h.to});return true;
    };

    function spawnAngle(offset){return g.ship.angle+g.ship.dir*(offset==null?1.52+rng()*.78:offset);}
    function hazardNear(ring,ang,tol){
      tol=tol||.28;
      for(var q=0;q<g.entities.length;q++){
        var e=g.entities[q];
        if(e.ring===ring&&e.kind!=='shard'&&ad(e.angle,ang)<tol)return true;
      }
      return false;
    }
    function mine(ring,ang){
      // Never generate an immediate two-ring wall from overlapping patterns.
      // If the opposite lane is already occupied at this angle, leave this
      // lane readable instead of producing a no-win collision.
      if(hazardNear(1-ring,ang,.27))return false;
      g.entities.push({kind:'mine',ring:ring,angle:ang,age:0,armed:false,near:false});return true;
    }
    function shard(ring,ang){
      g.entities.push({kind:'shard',ring:ring,angle:ang,age:0});
    }
    function comet(ring,ang){
      if(hazardNear(1-ring,ang,.24))return false;
      g.entities.push({kind:'comet',ring:ring,angle:ang,age:0,near:false,vel:-g.ship.dir*(1.04+rng()*.38)*g.omega()});return true;
    }
    function spawnPattern(){
      var d=clamp(g.time/85,0,1),roll=rng(),a=spawnAngle(),r=rng()<.5?0:1,o=1-r;
      // Gentle first seconds: teach the two-ring read before moving hazards appear.
      if(g.time<7){
        if(roll<.38){shard(r,a);}
        else{mine(r,a);shard(o,a+g.ship.dir*.035);}
        return;
      }
      // Every pattern has a readable safe solution and is visible well ahead.
      if(roll<.24){
        // Reward lane: easy shard, occasionally followed by an alternate shard.
        shard(r,a);
        if(g.time>14&&rng()<.55)shard(o,a+g.ship.dir*.42);
      }else if(roll<.52){
        // Core decision: hazard on one ring, reward on the safe ring.
        mine(r,a);shard(o,a+g.ship.dir*.035);
      }else if(roll<.70){
        mine(r,a);
        if(g.time>18&&rng()<.50+.25*d)mine(o,a+g.ship.dir*(.42+.14*rng()));
      }else if(roll<.85){
        if(g.time<12){mine(r,a);if(rng()<.65)shard(o,a+.03);return;}
        comet(r,a+.18);
        if(rng()<.6)shard(o,a);
      }else{
        // Slalom: alternating readable decisions. Only enabled once the player
        // has seen basic hazards.
        if(g.time<16){mine(r,a);return;}
        mine(r,a);mine(o,a+g.ship.dir*.48);shard(r,a+g.ship.dir*.88);
      }
    }
    function die(kind){
      g.state='over';g.events.push({type:'death',kind:kind||'hazard'});
    }

    g.update=function(dt){
      if(g.state!=='running')return;
      dt=Math.max(0,Math.min(dt,.05));g.time+=dt;
      g.stage=Math.floor(g.time/20)%5;

      g.ship.angle=(g.ship.angle+g.ship.dir*g.omega()*dt)%TAU;
      var h=g.ship.hop;
      if(h.active){
        h.t+=dt/C.HOP_TIME;
        if(h.t>=1){h.t=1;h.active=false;g.ship.ring=h.to;}
      }

      if(g.overdrive){
        g.overdriveLeft-=dt;
        g.flow=C.FLOW_MAX*clamp(g.overdriveLeft/C.OVERDRIVE_TIME,0,1);
        if(g.overdriveLeft<=0){g.overdrive=false;g.overdriveLeft=0;g.flow=0;g.events.push({type:'overdrive-end'});}
      }else{
        g.flow=Math.max(0,g.flow-C.FLOW_DECAY*dt);
      }

      // Age & move
      for(var i=g.entities.length-1;i>=0;i--){
        var e=g.entities[i];e.age+=dt;
        if(e.kind==='mine'){
          if(!e.armed&&e.age>=C.MINE_TELEGRAPH){e.armed=true;g.events.push({type:'mine-armed',ring:e.ring,angle:e.angle});}
          if(e.age>C.MINE_LIFE){g.entities.splice(i,1);continue;}
        }else if(e.kind==='comet'){
          e.angle=(e.angle+e.vel*dt)%TAU;
          if(e.age>C.COMET_LIFE){g.entities.splice(i,1);continue;}
        }else if(e.kind==='shard'){
          if(e.age>C.SHARD_LIFE){g.entities.splice(i,1);continue;}
        }
      }

      // Collision, reward and close-call pass.
      var ring=g.effectiveRing(),gotReward=false;
      for(var j=g.entities.length-1;j>=0;j--){
        var x=g.entities[j],dist=ad(g.ship.angle,x.angle);
        var arc=dist*C.RING_R[x.ring];
        if(x.kind==='shard'){
          if(x.ring===ring&&arc<C.SHIP_R+C.SHARD_R){
            g.entities.splice(j,1);g.shards++;score(C.SHARD_PTS);raiseCombo();addFlow(C.SHARD_FLOW);
            gotReward=true;g.events.push({type:'shard',combo:g.multiplier,flow:g.flow});continue;
          }
          continue;
        }
        var dangerous=x.kind==='comet'||x.armed;if(!dangerous)continue;
        var hr=x.kind==='mine'?C.MINE_R:C.COMET_R;
        if(x.ring===ring&&arc<C.SHIP_R+hr){die(x.kind);return;}
        if(x.ring!==ring&&!x.near&&dist<C.NEAR_MISS_ANG){
          x.near=true;g.nearMisses++;var precise=g.time-lastHopAt<=C.PRECISION_WINDOW;
          if(precise){
            g.precisionDodges++;score(C.PRECISION_PTS);addFlow(C.PRECISION_FLOW);raiseCombo();
            g.events.push({type:'precision',combo:g.multiplier,flow:g.flow});
          }else{
            score(C.NEAR_PTS);addFlow(C.NEAR_FLOW);comboTimer=0;
            g.events.push({type:'nearmiss',flow:g.flow});
          }
          gotReward=true;
        }
      }

      if(!gotReward&&g.multiplier>1){
        comboTimer+=dt;
        if(comboTimer>=C.COMBO_DECAY){comboTimer=0;g.multiplier--;g.events.push({type:'combo-down',value:g.multiplier});}
      }

      var milestone=Math.floor(g.time/15);
      if(milestone>lastMilestone){lastMilestone=milestone;g.events.push({type:'milestone',value:milestone*15});}

      spawnTimer+=dt;var interval=g.spawnInterval();
      while(spawnTimer>=interval){spawnTimer-=interval;spawnPattern();interval=g.spawnInterval();}
    };
    return g;
  };
})(typeof window!=='undefined'?window:globalThis);