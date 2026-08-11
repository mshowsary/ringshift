(function(root){
  'use strict';
  var RS=root.RS=root.RS||{};
  var ctx=null,out=null,musicGain=null,sfxGain=null,enabled=true,musicVol=.78,sfxVol=1;
  var timer=null,nextBeat=0,beat=0,nodes=[],noise=null,overdrive=false;

  function gainAt(parent,t,a,d,level){
    var g=ctx.createGain();g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(Math.max(.0001,level),t+a);
    g.gain.exponentialRampToValueAtTime(.0001,t+a+d);g.connect(parent);return g;
  }
  function osc(type,f,t){
    var o=ctx.createOscillator();o.type=type;o.frequency.setValueAtTime(f,t);return o;
  }
  function buildNoise(){
    var b=ctx.createBuffer(1,ctx.sampleRate*.5,ctx.sampleRate),d=b.getChannelData(0);
    for(var i=0;i<d.length;i++)d[i]=Math.random()*2-1;return b;
  }
  function apply(){
    if(!ctx)return;
    var now=ctx.currentTime;
    out.gain.setTargetAtTime(enabled?1:0,now,.015);
    musicGain.gain.setTargetAtTime(musicVol*.34,now,.025);
    sfxGain.gain.setTargetAtTime(sfxVol*.55,now,.02);
  }
  function tone(f,t,d,vol,type){
    var o=osc(type||'sine',f,t);o.connect(gainAt(sfxGain,t,.006,d,vol));o.start(t);o.stop(t+d+.03);
  }
  function filteredNoise(t,d,vol,freq){
    var s=ctx.createBufferSource();s.buffer=noise;var bp=ctx.createBiquadFilter();bp.type='bandpass';bp.frequency.value=freq;bp.Q.value=3;
    s.connect(bp);bp.connect(gainAt(sfxGain,t,.003,d,vol));s.start(t);s.stop(t+d+.02);
  }

  var FX={
    hop:function(t){tone(520,t,.08,.18,'triangle');tone(760,t+.025,.07,.10,'sine');},
    shard:function(t){tone(880,t,.10,.18,'sine');tone(1320,t+.045,.12,.12,'sine');},
    close:function(t){filteredNoise(t,.09,.10,2100);tone(440,t,.10,.08,'triangle');},
    perfect:function(t){tone(660,t,.09,.16,'sine');tone(990,t+.04,.11,.14,'sine');tone(1480,t+.085,.13,.12,'sine');},
    armed:function(t){tone(145,t,.08,.08,'square');},
    milestone:function(t){tone(392,t,.16,.10,'sine');tone(523.25,t+.07,.17,.10,'sine');},
    rush:function(t){filteredNoise(t,.26,.15,1800);[440,554.37,659.25,880].forEach(function(f,i){tone(f,t+i*.055,.22,.10,'sine');});},
    death:function(t){
      var o=osc('sawtooth',250,t);o.frequency.exponentialRampToValueAtTime(42,t+.52);o.connect(gainAt(sfxGain,t,.004,.55,.17));o.start(t);o.stop(t+.58);
      filteredNoise(t,.30,.18,780);
    },
    ui:function(t){tone(900,t,.045,.09,'sine');},
    best:function(t){[523.25,659.25,783.99,1046.5].forEach(function(f,i){tone(f,t+i*.07,.22,.10,'sine');});}
  };

  var roots=[110,123.47,98,130.81],arp=[220,261.63,293.66,329.63,392,440,523.25,587.33];
  function schedule(){
    if(!ctx||!timer)return;
    var horizon=ctx.currentTime+.28,spb=60/(overdrive?132:112);
    while(nextBeat<horizon){
      var t=nextBeat,rootF=roots[Math.floor(beat/4)%roots.length];
      if(beat%4===0){
        var pad=osc('triangle',rootF,t),lp=ctx.createBiquadFilter();lp.type='lowpass';lp.frequency.value=overdrive?1400:850;
        var g=ctx.createGain();g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.15,t+.22);g.gain.exponentialRampToValueAtTime(.0001,t+spb*3.8);
        pad.connect(lp);lp.connect(g);g.connect(musicGain);pad.start(t);pad.stop(t+spb*4);nodes.push(pad);
      }
      var idx=(beat*3+(overdrive?2:0))%arp.length,n=osc('sine',arp[idx],t);
      n.connect(gainAt(musicGain,t,.01,.12,overdrive?.16:.09));n.start(t);n.stop(t+.16);nodes.push(n);
      if(overdrive&&beat%2===0){var bass=osc('square',rootF/2,t);bass.connect(gainAt(musicGain,t,.004,.08,.06));bass.start(t);bass.stop(t+.10);nodes.push(bass);}
      nextBeat+=spb;beat++;
      if(nodes.length>72)nodes.splice(0,nodes.length-72);
    }
  }

  RS.audio={
    init:function(){
      if(ctx){try{if(ctx.state==='suspended')ctx.resume();}catch(e){}return;}
      var AC=root.AudioContext||root.webkitAudioContext;if(!AC)return;
      try{ctx=new AC();}catch(e){ctx=null;return;}
      out=ctx.createGain();out.connect(ctx.destination);musicGain=ctx.createGain();musicGain.connect(out);sfxGain=ctx.createGain();sfxGain.connect(out);noise=buildNoise();apply();
    },
    setEnabled:function(v){enabled=!!v;apply();},
    setMusic:function(v){musicVol=Math.max(0,Math.min(1,Number(v)||0));apply();},
    setSfx:function(v){sfxVol=Math.max(0,Math.min(1,Number(v)||0));apply();},
    setOverdrive:function(v){overdrive=!!v;},
    startMusic:function(){
      if(!ctx||timer)return;nextBeat=ctx.currentTime+.03;beat=0;timer=root.setInterval(schedule,90);schedule();
    },
    stopMusic:function(){
      if(timer){root.clearInterval(timer);timer=null;}
      for(var i=0;i<nodes.length;i++){try{nodes[i].stop();}catch(e){}}nodes.length=0;
    },
    suspend:function(){this.stopMusic();if(ctx&&ctx.state==='running'){try{ctx.suspend();}catch(e){}}},
    resume:function(){if(ctx&&ctx.state==='suspended'){try{ctx.resume();}catch(e){}}},
    sfx:function(name){if(!ctx||!enabled||ctx.state!=='running'||!FX[name])return;try{FX[name](ctx.currentTime);}catch(e){}}
  };
})(typeof window!=='undefined'?window:globalThis);