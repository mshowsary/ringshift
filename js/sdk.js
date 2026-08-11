(function(root){
  'use strict';
  var RS=root.RS=root.RS||{};
  var DEFAULTS={v:2,best:0,bestCombo:1,bestTime:0,runs:0,totalShards:0,totalNearMisses:0,music:.78,sfx:1,tutorialSeen:false};

  function copy(){return JSON.parse(JSON.stringify(DEFAULTS));}
  function n(v,d){var x=Number(v);return isFinite(x)&&x>=0?Math.floor(x):d;}
  function f(v,d){var x=Number(v);return isFinite(x)&&x>=0&&x<=1?x:d;}
  function yt(){try{return root.ytgame||null;}catch(e){return null;}}
  function inEnv(){try{var y=yt();return !!(y&&y.IN_PLAYABLES_ENV);}catch(e){return false;}}
  var state={loaded:false,first:false,ready:false};
  var LOCAL_KEY='ringshift-save';
  function localGet(){try{return root.localStorage?root.localStorage.getItem(LOCAL_KEY):null;}catch(e){return null;}}
  function localSet(str){try{if(root.localStorage)root.localStorage.setItem(LOCAL_KEY,str);}catch(e){}}

  RS.saveCodec={
    DEFAULTS:DEFAULTS,
    parse:function(str){
      var raw={};
      if(typeof str==='string'&&str.length){try{raw=JSON.parse(str)||{};}catch(e){raw={};}}
      if(!raw||typeof raw!=='object'||Array.isArray(raw))raw={};
      var out=copy();
      Object.keys(raw).forEach(function(k){out[k]=raw[k];});
      out.v=n(raw.v,DEFAULTS.v)||DEFAULTS.v;
      out.best=n(raw.best,0);out.bestCombo=Math.max(1,n(raw.bestCombo,1));
      out.bestTime=Math.max(0,Number(raw.bestTime)||0);out.runs=n(raw.runs,0);
      out.totalShards=n(raw.totalShards,0);out.totalNearMisses=n(raw.totalNearMisses,0);
      out.music=f(raw.music,DEFAULTS.music);out.sfx=f(raw.sfx,DEFAULTS.sfx);
      out.tutorialSeen=!!raw.tutorialSeen;
      return out;
    },
    serialize:function(obj){return JSON.stringify(obj);}
  };

  function logError(){try{var y=yt();if(y&&y.health&&y.health.logError)y.health.logError();}catch(e){}}

  RS.sdk={
    get inEnv(){return inEnv();},
    init:function(){
      if(!inEnv()){state.loaded=true;return Promise.resolve({save:RS.saveCodec.parse(localGet()),lang:'en'});}
      var loadP,langP;
      try{loadP=yt().game.loadData();}catch(e){loadP=Promise.reject();}
      try{langP=yt().system.getLanguage();}catch(e){langP=Promise.reject();}
      return Promise.allSettled([loadP,langP]).then(function(r){
        state.loaded=true;
        return{
          save:RS.saveCodec.parse(r[0].status==='fulfilled'?r[0].value:undefined),
          lang:r[1].status==='fulfilled'&&typeof r[1].value==='string'?r[1].value:'en'
        };
      });
    },
    firstFrameReady:function(){
      if(state.first)return;state.first=true;
      try{var y=yt();if(y&&y.game)y.game.firstFrameReady();}catch(e){}
    },
    gameReady:function(){
      if(state.ready)return;this.firstFrameReady();state.ready=true;
      try{var y=yt();if(y&&y.game)y.game.gameReady();}catch(e){}
    },
    save:function(obj){
      if(!state.loaded)return Promise.resolve();
      var str;try{str=RS.saveCodec.serialize(obj);}catch(e){return Promise.resolve();}
      if(!inEnv()){localSet(str);return Promise.resolve();}
      try{return Promise.resolve(yt().game.saveData(str)).catch(logError);}catch(e){logError();return Promise.resolve();}
    },
    sendBestScore:function(value){
      if(!inEnv())return Promise.resolve();
      var v=Math.max(0,Math.floor(Number(value)||0));
      try{return Promise.resolve(yt().engagement.sendScore({value:v})).catch(logError);}catch(e){logError();return Promise.resolve();}
    },
    isAudioEnabled:function(){
      if(!inEnv())return true;
      try{return !!yt().system.isAudioEnabled();}catch(e){return true;}
    },
    onAudioEnabledChange:function(cb){
      try{var y=yt();return y&&y.system&&y.system.onAudioEnabledChange?y.system.onAudioEnabledChange(cb)||function(){}:function(){};}catch(e){return function(){};}
    },
    onPause:function(cb){
      try{var y=yt();return y&&y.system&&y.system.onPause?y.system.onPause(cb)||function(){}:function(){};}catch(e){return function(){};}
    },
    onResume:function(cb){
      try{var y=yt();return y&&y.system&&y.system.onResume?y.system.onResume(cb)||function(){}:function(){};}catch(e){return function(){};}
    },
    logError:logError,
    _debugState:function(){return JSON.parse(JSON.stringify(state));}
  };
})(typeof window!=='undefined'?window:globalThis);