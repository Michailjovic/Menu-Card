/**
 * @license
 * Copyright 2019 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
const t$1=globalThis,e$2=t$1.ShadowRoot&&(void 0===t$1.ShadyCSS||t$1.ShadyCSS.nativeShadow)&&"adoptedStyleSheets"in Document.prototype&&"replace"in CSSStyleSheet.prototype,s$2=Symbol(),o$3=new WeakMap;class n$2{constructor(t,e,o){if(this._$cssResult$=!0,o!==s$2)throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");this.cssText=t,this.t=e;}get styleSheet(){let t=this.o;const s=this.t;if(e$2&&void 0===t){const e=void 0!==s&&1===s.length;e&&(t=o$3.get(s)),void 0===t&&((this.o=t=new CSSStyleSheet).replaceSync(this.cssText),e&&o$3.set(s,t));}return t}toString(){return this.cssText}}const r$2=t=>new n$2("string"==typeof t?t:t+"",void 0,s$2),i$3=(t,...e)=>{const o=1===t.length?t[0]:e.reduce((e,s,o)=>e+(t=>{if(!0===t._$cssResult$)return t.cssText;if("number"==typeof t)return t;throw Error("Value passed to 'css' function must be a 'css' function result: "+t+". Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.")})(s)+t[o+1],t[0]);return new n$2(o,t,s$2)},S$1=(s,o)=>{if(e$2)s.adoptedStyleSheets=o.map(t=>t instanceof CSSStyleSheet?t:t.styleSheet);else for(const e of o){const o=document.createElement("style"),n=t$1.litNonce;void 0!==n&&o.setAttribute("nonce",n),o.textContent=e.cssText,s.appendChild(o);}},c$2=e$2?t=>t:t=>t instanceof CSSStyleSheet?(t=>{let e="";for(const s of t.cssRules)e+=s.cssText;return r$2(e)})(t):t;

/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const{is:i$2,defineProperty:e$1,getOwnPropertyDescriptor:h$1,getOwnPropertyNames:r$1,getOwnPropertySymbols:o$2,getPrototypeOf:n$1}=Object,a$1=globalThis,c$1=a$1.trustedTypes,l$1=c$1?c$1.emptyScript:"",p$1=a$1.reactiveElementPolyfillSupport,d$1=(t,s)=>t,u$1={toAttribute(t,s){switch(s){case Boolean:t=t?l$1:null;break;case Object:case Array:t=null==t?t:JSON.stringify(t);}return t},fromAttribute(t,s){let i=t;switch(s){case Boolean:i=null!==t;break;case Number:i=null===t?null:Number(t);break;case Object:case Array:try{i=JSON.parse(t);}catch(t){i=null;}}return i}},f$1=(t,s)=>!i$2(t,s),b$1={attribute:!0,type:String,converter:u$1,reflect:!1,useDefault:!1,hasChanged:f$1};Symbol.metadata??=Symbol("metadata"),a$1.litPropertyMetadata??=new WeakMap;class y$1 extends HTMLElement{static addInitializer(t){this._$Ei(),(this.l??=[]).push(t);}static get observedAttributes(){return this.finalize(),this._$Eh&&[...this._$Eh.keys()]}static createProperty(t,s=b$1){if(s.state&&(s.attribute=!1),this._$Ei(),this.prototype.hasOwnProperty(t)&&((s=Object.create(s)).wrapped=!0),this.elementProperties.set(t,s),!s.noAccessor){const i=Symbol(),h=this.getPropertyDescriptor(t,i,s);void 0!==h&&e$1(this.prototype,t,h);}}static getPropertyDescriptor(t,s,i){const{get:e,set:r}=h$1(this.prototype,t)??{get(){return this[s]},set(t){this[s]=t;}};return {get:e,set(s){const h=e?.call(this);r?.call(this,s),this.requestUpdate(t,h,i);},configurable:!0,enumerable:!0}}static getPropertyOptions(t){return this.elementProperties.get(t)??b$1}static _$Ei(){if(this.hasOwnProperty(d$1("elementProperties")))return;const t=n$1(this);t.finalize(),void 0!==t.l&&(this.l=[...t.l]),this.elementProperties=new Map(t.elementProperties);}static finalize(){if(this.hasOwnProperty(d$1("finalized")))return;if(this.finalized=!0,this._$Ei(),this.hasOwnProperty(d$1("properties"))){const t=this.properties,s=[...r$1(t),...o$2(t)];for(const i of s)this.createProperty(i,t[i]);}const t=this[Symbol.metadata];if(null!==t){const s=litPropertyMetadata.get(t);if(void 0!==s)for(const[t,i]of s)this.elementProperties.set(t,i);}this._$Eh=new Map;for(const[t,s]of this.elementProperties){const i=this._$Eu(t,s);void 0!==i&&this._$Eh.set(i,t);}this.elementStyles=this.finalizeStyles(this.styles);}static finalizeStyles(s){const i=[];if(Array.isArray(s)){const e=new Set(s.flat(1/0).reverse());for(const s of e)i.unshift(c$2(s));}else void 0!==s&&i.push(c$2(s));return i}static _$Eu(t,s){const i=s.attribute;return !1===i?void 0:"string"==typeof i?i:"string"==typeof t?t.toLowerCase():void 0}constructor(){super(),this._$Ep=void 0,this.isUpdatePending=!1,this.hasUpdated=!1,this._$Em=null,this._$Ev();}_$Ev(){this._$ES=new Promise(t=>this.enableUpdating=t),this._$AL=new Map,this._$E_(),this.requestUpdate(),this.constructor.l?.forEach(t=>t(this));}addController(t){(this._$EO??=new Set).add(t),void 0!==this.renderRoot&&this.isConnected&&t.hostConnected?.();}removeController(t){this._$EO?.delete(t);}_$E_(){const t=new Map,s=this.constructor.elementProperties;for(const i of s.keys())this.hasOwnProperty(i)&&(t.set(i,this[i]),delete this[i]);t.size>0&&(this._$Ep=t);}createRenderRoot(){const t=this.shadowRoot??this.attachShadow(this.constructor.shadowRootOptions);return S$1(t,this.constructor.elementStyles),t}connectedCallback(){this.renderRoot??=this.createRenderRoot(),this.enableUpdating(!0),this._$EO?.forEach(t=>t.hostConnected?.());}enableUpdating(t){}disconnectedCallback(){this._$EO?.forEach(t=>t.hostDisconnected?.());}attributeChangedCallback(t,s,i){this._$AK(t,i);}_$ET(t,s){const i=this.constructor.elementProperties.get(t),e=this.constructor._$Eu(t,i);if(void 0!==e&&!0===i.reflect){const h=(void 0!==i.converter?.toAttribute?i.converter:u$1).toAttribute(s,i.type);this._$Em=t,null==h?this.removeAttribute(e):this.setAttribute(e,h),this._$Em=null;}}_$AK(t,s){const i=this.constructor,e=i._$Eh.get(t);if(void 0!==e&&this._$Em!==e){const t=i.getPropertyOptions(e),h="function"==typeof t.converter?{fromAttribute:t.converter}:void 0!==t.converter?.fromAttribute?t.converter:u$1;this._$Em=e;const r=h.fromAttribute(s,t.type);this[e]=r??this._$Ej?.get(e)??r,this._$Em=null;}}requestUpdate(t,s,i,e=!1,h){if(void 0!==t){const r=this.constructor;if(!1===e&&(h=this[t]),i??=r.getPropertyOptions(t),!((i.hasChanged??f$1)(h,s)||i.useDefault&&i.reflect&&h===this._$Ej?.get(t)&&!this.hasAttribute(r._$Eu(t,i))))return;this.C(t,s,i);}!1===this.isUpdatePending&&(this._$ES=this._$EP());}C(t,s,{useDefault:i,reflect:e,wrapped:h},r){i&&!(this._$Ej??=new Map).has(t)&&(this._$Ej.set(t,r??s??this[t]),!0!==h||void 0!==r)||(this._$AL.has(t)||(this.hasUpdated||i||(s=void 0),this._$AL.set(t,s)),!0===e&&this._$Em!==t&&(this._$Eq??=new Set).add(t));}async _$EP(){this.isUpdatePending=!0;try{await this._$ES;}catch(t){Promise.reject(t);}const t=this.scheduleUpdate();return null!=t&&await t,!this.isUpdatePending}scheduleUpdate(){return this.performUpdate()}performUpdate(){if(!this.isUpdatePending)return;if(!this.hasUpdated){if(this.renderRoot??=this.createRenderRoot(),this._$Ep){for(const[t,s]of this._$Ep)this[t]=s;this._$Ep=void 0;}const t=this.constructor.elementProperties;if(t.size>0)for(const[s,i]of t){const{wrapped:t}=i,e=this[s];!0!==t||this._$AL.has(s)||void 0===e||this.C(s,void 0,i,e);}}let t=!1;const s=this._$AL;try{t=this.shouldUpdate(s),t?(this.willUpdate(s),this._$EO?.forEach(t=>t.hostUpdate?.()),this.update(s)):this._$EM();}catch(s){throw t=!1,this._$EM(),s}t&&this._$AE(s);}willUpdate(t){}_$AE(t){this._$EO?.forEach(t=>t.hostUpdated?.()),this.hasUpdated||(this.hasUpdated=!0,this.firstUpdated(t)),this.updated(t);}_$EM(){this._$AL=new Map,this.isUpdatePending=!1;}get updateComplete(){return this.getUpdateComplete()}getUpdateComplete(){return this._$ES}shouldUpdate(t){return !0}update(t){this._$Eq&&=this._$Eq.forEach(t=>this._$ET(t,this[t])),this._$EM();}updated(t){}firstUpdated(t){}}y$1.elementStyles=[],y$1.shadowRootOptions={mode:"open"},y$1[d$1("elementProperties")]=new Map,y$1[d$1("finalized")]=new Map,p$1?.({ReactiveElement:y$1}),(a$1.reactiveElementVersions??=[]).push("2.1.2");

/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
const t=globalThis,i$1=t=>t,s$1=t.trustedTypes,e=s$1?s$1.createPolicy("lit-html",{createHTML:t=>t}):void 0,h="$lit$",o$1=`lit$${Math.random().toFixed(9).slice(2)}$`,n="?"+o$1,r=`<${n}>`,l=document,c=()=>l.createComment(""),a=t=>null===t||"object"!=typeof t&&"function"!=typeof t,u=Array.isArray,d=t=>u(t)||"function"==typeof t?.[Symbol.iterator],f="[ \t\n\f\r]",v=/<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g,_=/-->/g,m=/>/g,p=RegExp(`>|${f}(?:([^\\s"'>=/]+)(${f}*=${f}*(?:[^ \t\n\f\r"'\`<>=]|("|')|))|$)`,"g"),g=/'/g,$=/"/g,y=/^(?:script|style|textarea|title)$/i,x=t=>(i,...s)=>({_$litType$:t,strings:i,values:s}),b=x(1),E=Symbol.for("lit-noChange"),A=Symbol.for("lit-nothing"),C=new WeakMap,P=l.createTreeWalker(l,129);function V(t,i){if(!u(t)||!t.hasOwnProperty("raw"))throw Error("invalid template strings array");return void 0!==e?e.createHTML(i):i}const N=(t,i)=>{const s=t.length-1,e=[];let n,l=2===i?"<svg>":3===i?"<math>":"",c=v;for(let i=0;i<s;i++){const s=t[i];let a,u,d=-1,f=0;for(;f<s.length&&(c.lastIndex=f,u=c.exec(s),null!==u);)f=c.lastIndex,c===v?"!--"===u[1]?c=_:void 0!==u[1]?c=m:void 0!==u[2]?(y.test(u[2])&&(n=RegExp("</"+u[2],"g")),c=p):void 0!==u[3]&&(c=p):c===p?">"===u[0]?(c=n??v,d=-1):void 0===u[1]?d=-2:(d=c.lastIndex-u[2].length,a=u[1],c=void 0===u[3]?p:'"'===u[3]?$:g):c===$||c===g?c=p:c===_||c===m?c=v:(c=p,n=void 0);const x=c===p&&t[i+1].startsWith("/>")?" ":"";l+=c===v?s+r:d>=0?(e.push(a),s.slice(0,d)+h+s.slice(d)+o$1+x):s+o$1+(-2===d?i:x);}return [V(t,l+(t[s]||"<?>")+(2===i?"</svg>":3===i?"</math>":"")),e]};class S{constructor({strings:t,_$litType$:i},e){let r;this.parts=[];let l=0,a=0;const u=t.length-1,d=this.parts,[f,v]=N(t,i);if(this.el=S.createElement(f,e),P.currentNode=this.el.content,2===i||3===i){const t=this.el.content.firstChild;t.replaceWith(...t.childNodes);}for(;null!==(r=P.nextNode())&&d.length<u;){if(1===r.nodeType){if(r.hasAttributes())for(const t of r.getAttributeNames())if(t.endsWith(h)){const i=v[a++],s=r.getAttribute(t).split(o$1),e=/([.?@])?(.*)/.exec(i);d.push({type:1,index:l,name:e[2],strings:s,ctor:"."===e[1]?I:"?"===e[1]?L:"@"===e[1]?z:H}),r.removeAttribute(t);}else t.startsWith(o$1)&&(d.push({type:6,index:l}),r.removeAttribute(t));if(y.test(r.tagName)){const t=r.textContent.split(o$1),i=t.length-1;if(i>0){r.textContent=s$1?s$1.emptyScript:"";for(let s=0;s<i;s++)r.append(t[s],c()),P.nextNode(),d.push({type:2,index:++l});r.append(t[i],c());}}}else if(8===r.nodeType)if(r.data===n)d.push({type:2,index:l});else {let t=-1;for(;-1!==(t=r.data.indexOf(o$1,t+1));)d.push({type:7,index:l}),t+=o$1.length-1;}l++;}}static createElement(t,i){const s=l.createElement("template");return s.innerHTML=t,s}}function M(t,i,s=t,e){if(i===E)return i;let h=void 0!==e?s._$Co?.[e]:s._$Cl;const o=a(i)?void 0:i._$litDirective$;return h?.constructor!==o&&(h?._$AO?.(!1),void 0===o?h=void 0:(h=new o(t),h._$AT(t,s,e)),void 0!==e?(s._$Co??=[])[e]=h:s._$Cl=h),void 0!==h&&(i=M(t,h._$AS(t,i.values),h,e)),i}class R{constructor(t,i){this._$AV=[],this._$AN=void 0,this._$AD=t,this._$AM=i;}get parentNode(){return this._$AM.parentNode}get _$AU(){return this._$AM._$AU}u(t){const{el:{content:i},parts:s}=this._$AD,e=(t?.creationScope??l).importNode(i,!0);P.currentNode=e;let h=P.nextNode(),o=0,n=0,r=s[0];for(;void 0!==r;){if(o===r.index){let i;2===r.type?i=new k(h,h.nextSibling,this,t):1===r.type?i=new r.ctor(h,r.name,r.strings,this,t):6===r.type&&(i=new Z(h,this,t)),this._$AV.push(i),r=s[++n];}o!==r?.index&&(h=P.nextNode(),o++);}return P.currentNode=l,e}p(t){let i=0;for(const s of this._$AV)void 0!==s&&(void 0!==s.strings?(s._$AI(t,s,i),i+=s.strings.length-2):s._$AI(t[i])),i++;}}class k{get _$AU(){return this._$AM?._$AU??this._$Cv}constructor(t,i,s,e){this.type=2,this._$AH=A,this._$AN=void 0,this._$AA=t,this._$AB=i,this._$AM=s,this.options=e,this._$Cv=e?.isConnected??!0;}get parentNode(){let t=this._$AA.parentNode;const i=this._$AM;return void 0!==i&&11===t?.nodeType&&(t=i.parentNode),t}get startNode(){return this._$AA}get endNode(){return this._$AB}_$AI(t,i=this){t=M(this,t,i),a(t)?t===A||null==t||""===t?(this._$AH!==A&&this._$AR(),this._$AH=A):t!==this._$AH&&t!==E&&this._(t):void 0!==t._$litType$?this.$(t):void 0!==t.nodeType?this.T(t):d(t)?this.k(t):this._(t);}O(t){return this._$AA.parentNode.insertBefore(t,this._$AB)}T(t){this._$AH!==t&&(this._$AR(),this._$AH=this.O(t));}_(t){this._$AH!==A&&a(this._$AH)?this._$AA.nextSibling.data=t:this.T(l.createTextNode(t)),this._$AH=t;}$(t){const{values:i,_$litType$:s}=t,e="number"==typeof s?this._$AC(t):(void 0===s.el&&(s.el=S.createElement(V(s.h,s.h[0]),this.options)),s);if(this._$AH?._$AD===e)this._$AH.p(i);else {const t=new R(e,this),s=t.u(this.options);t.p(i),this.T(s),this._$AH=t;}}_$AC(t){let i=C.get(t.strings);return void 0===i&&C.set(t.strings,i=new S(t)),i}k(t){u(this._$AH)||(this._$AH=[],this._$AR());const i=this._$AH;let s,e=0;for(const h of t)e===i.length?i.push(s=new k(this.O(c()),this.O(c()),this,this.options)):s=i[e],s._$AI(h),e++;e<i.length&&(this._$AR(s&&s._$AB.nextSibling,e),i.length=e);}_$AR(t=this._$AA.nextSibling,s){for(this._$AP?.(!1,!0,s);t!==this._$AB;){const s=i$1(t).nextSibling;i$1(t).remove(),t=s;}}setConnected(t){void 0===this._$AM&&(this._$Cv=t,this._$AP?.(t));}}class H{get tagName(){return this.element.tagName}get _$AU(){return this._$AM._$AU}constructor(t,i,s,e,h){this.type=1,this._$AH=A,this._$AN=void 0,this.element=t,this.name=i,this._$AM=e,this.options=h,s.length>2||""!==s[0]||""!==s[1]?(this._$AH=Array(s.length-1).fill(new String),this.strings=s):this._$AH=A;}_$AI(t,i=this,s,e){const h=this.strings;let o=!1;if(void 0===h)t=M(this,t,i,0),o=!a(t)||t!==this._$AH&&t!==E,o&&(this._$AH=t);else {const e=t;let n,r;for(t=h[0],n=0;n<h.length-1;n++)r=M(this,e[s+n],i,n),r===E&&(r=this._$AH[n]),o||=!a(r)||r!==this._$AH[n],r===A?t=A:t!==A&&(t+=(r??"")+h[n+1]),this._$AH[n]=r;}o&&!e&&this.j(t);}j(t){t===A?this.element.removeAttribute(this.name):this.element.setAttribute(this.name,t??"");}}class I extends H{constructor(){super(...arguments),this.type=3;}j(t){this.element[this.name]=t===A?void 0:t;}}class L extends H{constructor(){super(...arguments),this.type=4;}j(t){this.element.toggleAttribute(this.name,!!t&&t!==A);}}class z extends H{constructor(t,i,s,e,h){super(t,i,s,e,h),this.type=5;}_$AI(t,i=this){if((t=M(this,t,i,0)??A)===E)return;const s=this._$AH,e=t===A&&s!==A||t.capture!==s.capture||t.once!==s.once||t.passive!==s.passive,h=t!==A&&(s===A||e);e&&this.element.removeEventListener(this.name,this,s),h&&this.element.addEventListener(this.name,this,t),this._$AH=t;}handleEvent(t){"function"==typeof this._$AH?this._$AH.call(this.options?.host??this.element,t):this._$AH.handleEvent(t);}}class Z{constructor(t,i,s){this.element=t,this.type=6,this._$AN=void 0,this._$AM=i,this.options=s;}get _$AU(){return this._$AM._$AU}_$AI(t){M(this,t);}}const B=t.litHtmlPolyfillSupport;B?.(S,k),(t.litHtmlVersions??=[]).push("3.3.3");const D=(t,i,s)=>{const e=s?.renderBefore??i;let h=e._$litPart$;if(void 0===h){const t=s?.renderBefore??null;e._$litPart$=h=new k(i.insertBefore(c(),t),t,void 0,s??{});}return h._$AI(t),h};

/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const s=globalThis;class i extends y$1{constructor(){super(...arguments),this.renderOptions={host:this},this._$Do=void 0;}createRenderRoot(){const t=super.createRenderRoot();return this.renderOptions.renderBefore??=t.firstChild,t}update(t){const r=this.render();this.hasUpdated||(this.renderOptions.isConnected=this.isConnected),super.update(t),this._$Do=D(r,this.renderRoot,this.renderOptions);}connectedCallback(){super.connectedCallback(),this._$Do?.setConnected(!0);}disconnectedCallback(){super.disconnectedCallback(),this._$Do?.setConnected(!1);}render(){return E}}i._$litElement$=!0,i["finalized"]=!0,s.litElementHydrateSupport?.({LitElement:i});const o=s.litElementPolyfillSupport;o?.({LitElement:i});(s.litElementVersions??=[]).push("4.2.2");

/**
 * room-navbar-card  v0.0.15
 *
 * LitElement rewrite – proper HA custom card with GUI editor.
 *
 * Architecture:
 *   - RoomNavbarCard      : display card, renders navbar with room images + filters
 *   - RoomNavbarCardEditor: LitElement editor with ha-entity-picker, sliders, actions
 *
 * Filter: Python backend sensor (sensor.rnc_{config_id}_{room_id}_filter) takes
 *   priority; JS fallback used when sensor is unavailable.
 */

const VERSION      = '0.0.15';
const CARD_TAG     = 'room-navbar-card';
const EDITOR_TAG   = 'room-navbar-card-editor';
const SENSOR_PFX   = 'rnc';

// ── Helpers ──────────────────────────────────────────────────────────────────

function fireEvent(node, type, detail = {}) {
  const ev = new Event(type, { bubbles: true, cancelable: false, composed: true });
  ev.detail = detail;
  node.dispatchEvent(ev);
}

function navigate(path) {
  window.history.pushState(null, '', path);
  fireEvent(window, 'location-changed', { replace: false });
}

function tempColor(v) {
  const n = parseFloat(v);
  if (isNaN(n)) return 'rgba(255,255,255,0.7)';
  return n > 25 ? '#ff4d4f' : n < 18 ? '#40a9ff' : '#52c41a';
}

function humColor(v) {
  const n = parseFloat(v);
  if (isNaN(n)) return 'rgba(255,255,255,0.7)';
  return n >= 60 ? '#ff4d4f' : n >= 55 ? '#faad14' : '#52c41a';
}

function parseFilter(str = '') {
  const get = fn => {
    const m = str.match(new RegExp(fn + '\\(([^)]+)\\)'));
    return m ? parseFloat(m[1]) : null;
  };
  return {
    brightness: get('brightness') ?? 1.0,
    saturate:   get('saturate')   ?? 1.0,
    sepia:      get('sepia')      ?? 0.0,
    hueRotate:  get('hue-rotate') ?? 0.0,
  };
}

function buildFilter({ brightness, saturate, sepia, hueRotate }) {
  const p = [`brightness(${brightness.toFixed(2)})`];
  if (sepia > 0.005)                p.push(`sepia(${sepia.toFixed(2)})`);
  if (Math.abs(saturate - 1) > 0.01) p.push(`saturate(${saturate.toFixed(2)})`);
  if (Math.abs(hueRotate) > 0.5)   p.push(`hue-rotate(${Math.round(hueRotate)}deg)`);
  return p.join(' ');
}

function slugify(s = '') {
  return s.toLowerCase().replace(/[^a-z0-9_]/g, '_');
}

// ── Tap / Hold / Double-tap ───────────────────────────────────────────────────

class ActionHandler {
  constructor(el, cb) {
    this._el = el; this._cb = cb;
    this._timer = null; this._tapCount = 0; this._tapTimer = null; this._fired = false;
    this._bind();
  }
  _bind() {
    const onDown = e => {
      e.preventDefault(); this._fired = false;
      this._timer = setTimeout(() => { this._fired = true; this._cb.hold?.(); }, 500);
    };
    const onUp = () => {
      clearTimeout(this._timer);
      if (this._fired) return;
      this._tapCount++;
      clearTimeout(this._tapTimer);
      this._tapTimer = setTimeout(() => {
        if (this._tapCount === 1) this._cb.tap?.();
        else this._cb.double_tap?.();
        this._tapCount = 0;
      }, 250);
    };
    const onCancel = () => { clearTimeout(this._timer); this._fired = true; };
    this._el.addEventListener('mousedown', onDown);
    this._el.addEventListener('mouseup', onUp);
    this._el.addEventListener('touchstart', onDown, { passive: false });
    this._el.addEventListener('touchend', onUp);
    this._el.addEventListener('touchmove', onCancel, { passive: true });
  }
}

// ── Main card ─────────────────────────────────────────────────────────────────

class RoomNavbarCard extends i {
  static properties = {
    hass:        { attribute: false },
    _menuConfig: { state: true },
  };

  _cardConfig    = null;
  _configLoaded  = false;
  _actionHandlers = [];

  static getConfigElement() { return document.createElement(EDITOR_TAG); }
  static getStubConfig()    { return { config_id: 'main_navbar' }; }
  getCardSize()             { return 1; }

  setConfig(config) {
    if (!config) throw new Error('room-navbar-card: missing config');
    this._cardConfig   = config;
    this._configLoaded = false;
    if (config.rooms?.length) {
      this._menuConfig = { rooms: config.rooms };
    } else if (this.hass) {
      this._loadConfig();
    }
  }

  updated(changed) {
    if (changed.has('hass') && this.hass && !this._configLoaded && this._cardConfig?.config_id) {
      this._loadConfig();
    }
    if (changed.has('_menuConfig')) {
      this._bindActions();
    }
  }

  async _loadConfig() {
    this._configLoaded = true;
    try {
      this._menuConfig = await this.hass.connection.sendMessagePromise({
        type: 'room_navbar/get_config',
        config_id: this._cardConfig.config_id,
      });
    } catch {
      this._menuConfig = null;
    }
  }

  _computeFilter(room) {
    if (this._cardConfig?.config_id && this.hass) {
      const id = `sensor.${SENSOR_PFX}_${slugify(this._cardConfig.config_id)}_${slugify(room.id)}_filter`;
      const s  = this.hass.states[id];
      if (s && s.state && s.state !== 'unavailable' && s.state !== 'unknown') return s.state;
    }
    if (!this.hass) return room.filter_off ?? 'brightness(0.6)';
    const on = this.hass.states[room.light_entity]?.state === 'on';
    return on ? (room.filter_on ?? 'brightness(1.8) sepia(0.2)') : (room.filter_off ?? 'brightness(0.6)');
  }

  _handleAction(room, action) {
    if (!action || action.action === 'none') return;
    switch (action.action) {
      case 'navigate':
        navigate(action.navigation_path ?? '/');
        break;
      case 'more-info':
        fireEvent(this, 'hass-more-info', { entityId: action.entity ?? room.light_entity });
        break;
      case 'toggle':
        if (room.light_entity) this.hass.callService('homeassistant', 'toggle', { entity_id: room.light_entity });
        break;
      case 'fire-dom-event':
        fireEvent(this, 'll-custom', action);
        break;
      case 'call-service': {
        const [domain, service] = (action.service ?? '').split('.');
        if (domain && service) this.hass.callService(domain, service, action.service_data ?? {});
        break;
      }
    }
  }

  _bindActions() {
    this._actionHandlers.forEach(h => h._el.remove?.());
    this._actionHandlers = [];
    this.shadowRoot?.querySelectorAll('.room-btn').forEach(el => {
      const roomId = el.dataset.room;
      const room   = this._menuConfig?.rooms.find(r => r.id === roomId);
      if (!room) return;
      this._actionHandlers.push(new ActionHandler(el, {
        tap:        () => this._handleAction(room, room.tap_action),
        hold:       () => this._handleAction(room, room.hold_action),
        double_tap: () => this._handleAction(room, room.double_tap_action),
      }));
    });
  }

  static styles = i$3`
    :host { display: block; }
    .navbar {
      display: flex;
      gap: 6px;
      padding: 6px;
      overflow-x: auto;
      scrollbar-width: none;
    }
    .navbar::-webkit-scrollbar { display: none; }
    .room-btn {
      flex: 0 0 auto;
      width: 72px;
      height: 90px;
      border-radius: 12px;
      overflow: hidden;
      position: relative;
      cursor: pointer;
      user-select: none;
    }
    .room-bg {
      position: absolute; inset: 0;
      background-size: cover;
      background-position: center;
      transition: filter 1.5s ease;
    }
    .room-overlay {
      position: absolute; inset: 0;
      background-size: cover;
      background-position: center;
      transition: opacity 2s ease;
    }
    .room-info {
      position: absolute; inset: 0;
      display: flex; flex-direction: column;
      justify-content: flex-end;
      padding: 4px;
      background: linear-gradient(to top, rgba(0,0,0,.5) 0%, transparent 60%);
    }
    .room-label {
      font-size: 9px; font-weight: 600;
      color: #fff; text-align: center;
      text-shadow: 0 1px 3px rgba(0,0,0,.8);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .room-sensors {
      display: flex; justify-content: center; gap: 3px;
      font-size: 8px; color: rgba(255,255,255,.85);
    }
    .placeholder {
      padding: 16px; font-size: 13px;
      color: var(--secondary-text-color);
      white-space: pre-line;
    }
  `;

  render() {
    const rooms = this._menuConfig?.rooms;
    if (!rooms?.length) {
      return b`<div class="placeholder">${
        this._menuConfig === null
          ? 'Loading configuration…'
          : this._menuConfig
            ? 'No rooms in configuration.'
            : `⚠️ Configuration '${this._cardConfig?.config_id}' not found.`
      }</div>`;
    }
    return b`
      <div class="navbar">
        ${rooms.map(room => this._renderRoom(room))}
      </div>
    `;
  }

  _renderRoom(room) {
    const filter   = this._computeFilter(room);
    const lightOn  = this.hass?.states[room.light_entity]?.state === 'on';
    const tempVal  = this.hass?.states[room.temp_sensor]?.state;
    const humVal   = this.hass?.states[room.humidity_sensor]?.state;
    const overlayOpacity = lightOn ? 0 : 1;

    return b`
      <div class="room-btn" data-room="${room.id}">
        <div class="room-bg" style="
          background-image: url('${room.image_url ?? ''}');
          filter: ${filter};
          transition: filter ${room.transition_filter ?? '1.5s'} ease;
        "></div>
        ${room.overlay_image_url ? b`
          <div class="room-overlay" style="
            background-image: url('${room.overlay_image_url}');
            opacity: ${overlayOpacity};
            transition: opacity ${room.transition_overlay ?? '2s'} ease;
          "></div>
        ` : A}
        <div class="room-info">
          ${(tempVal || humVal) ? b`
            <div class="room-sensors">
              ${tempVal ? b`<span style="color:${tempColor(tempVal)}">${parseFloat(tempVal).toFixed(1)}°</span>` : A}
              ${humVal  ? b`<span style="color:${humColor(humVal)}">${Math.round(parseFloat(humVal))}%</span>` : A}
            </div>
          ` : A}
          <div class="room-label">${room.id}</div>
        </div>
      </div>
    `;
  }
}

// ── Editor ───────────────────────────────────────────────────────────────────

const ACTION_TYPES = [
  { value: 'none',           label: 'None' },
  { value: 'navigate',       label: 'Navigate' },
  { value: 'more-info',      label: 'More info' },
  { value: 'toggle',         label: 'Toggle light' },
  { value: 'fire-dom-event', label: 'Popup (browser_mod)' },
  { value: 'call-service',   label: 'Call service' },
];

class RoomNavbarCardEditor extends i {
  static properties = {
    hass:          { attribute: false },
    _config:       { state: true },
    _menuConfig:   { state: true },
    _availConfigs: { state: true },
    _saving:       { state: true },
    _saveStatus:   { state: true },
    _expanded:     { state: true },
    _backendOk:    { state: true },
  };

  // Disable Shadow DOM – ha-entity-picker and other HA lazy-loaded elements
  // must live in the light DOM to be properly upgraded and styled by HA.
  createRenderRoot() { return this; }

  constructor() {
    super();
    this._config       = {};
    this._menuConfig   = null;
    this._availConfigs = null;
    this._saving       = false;
    this._saveStatus   = null;
    this._expanded     = new Set();
    this._backendOk    = true;
  }

  setConfig(config) {
    const prevId = this._config?.config_id;
    this._config = { ...config };
    if (config.config_id && config.config_id !== prevId) {
      this._menuConfig = null;
      if (this.hass) this._loadMenuConfig(config.config_id);
    }
  }

  updated(changed) {
    if (changed.has('hass') && this.hass && this._availConfigs === null) {
      this._fetchConfigs();
    }
  }

  // ── Backend ───────────────────────────────────────────────────────────────

  async _fetchConfigs() {
    try {
      const r = await this.hass.connection.sendMessagePromise({ type: 'room_navbar/list_configs' });
      this._availConfigs = r.configs ?? [];
      this._backendOk    = true;
    } catch {
      this._availConfigs = [];
      this._backendOk    = false;
    }
    if (this._config.config_id && !this._menuConfig) {
      await this._loadMenuConfig(this._config.config_id);
    } else if (!this._menuConfig) {
      this._menuConfig = { name: '', rooms: this._config.rooms ? [...this._config.rooms] : [] };
    }
  }

  async _loadMenuConfig(configId) {
    try {
      this._menuConfig = await this.hass.connection.sendMessagePromise({
        type: 'room_navbar/get_config',
        config_id: configId,
      });
    } catch {
      this._menuConfig = { name: configId, rooms: [] };
    }
  }

  async _saveConfig() {
    if (this._saving || !this._menuConfig) return;
    const configId = this._config.config_id?.trim();
    if (!configId) { alert('Enter a Config ID first.'); return; }
    for (const r of this._menuConfig.rooms ?? []) {
      if (!r.id?.trim()) { alert('Every room must have an ID.'); return; }
    }
    this._saving    = true;
    this._saveStatus = null;
    try {
      await this.hass.connection.sendMessagePromise({
        type:        'room_navbar/save_config',
        config_id:   configId,
        config_data: this._menuConfig,
      });
      this._saveStatus = 'ok';
      await this._fetchConfigs();
      fireEvent(this, 'config-changed', { config: { ...this._config, config_id: configId } });
    } catch (e) {
      this._saveStatus = 'err';
      console.error('[RoomNavbar editor] save failed', e);
    } finally {
      this._saving = false;
      setTimeout(() => { this._saveStatus = null; this.requestUpdate(); }, 4000);
    }
  }

  // ── Model helpers ─────────────────────────────────────────────────────────

  _addRoom() {
    if (!this._menuConfig) this._menuConfig = { name: '', rooms: [] };
    const id = `room_${Date.now()}`;
    this._menuConfig = {
      ...this._menuConfig,
      rooms: [...this._menuConfig.rooms, {
        id,
        light_entity: '',
        image_url: '',
        overlay_image_url: '',
        temp_sensor: '',
        humidity_sensor: '',
        filter_off:  'brightness(0.60) saturate(1.00)',
        filter_on:   'brightness(1.80) sepia(0.20) saturate(1.20)',
        filter_day:  'brightness(1.30) saturate(1.05)',
        transition_filter:  '1.5s',
        transition_overlay: '2.0s',
        tap_action: { action: 'navigate', navigation_path: '' },
      }],
    };
    this._expanded = new Set([...this._expanded, id]);
  }

  _deleteRoom(roomId) {
    this._menuConfig = {
      ...this._menuConfig,
      rooms: this._menuConfig.rooms.filter(r => r.id !== roomId),
    };
    this._expanded.delete(roomId);
    this._expanded = new Set(this._expanded);
  }

  _toggleExpand(roomId) {
    const s = new Set(this._expanded);
    s.has(roomId) ? s.delete(roomId) : s.add(roomId);
    this._expanded = s;
  }

  _updateRoom(roomId, patch) {
    this._menuConfig = {
      ...this._menuConfig,
      rooms: this._menuConfig.rooms.map(r => r.id === roomId ? { ...r, ...patch } : r),
    };
  }

  _updateAction(roomId, actionKey, patch) {
    const room = this._menuConfig.rooms.find(r => r.id === roomId);
    if (!room) return;
    this._updateRoom(roomId, { [actionKey]: { ...(room[actionKey] ?? {}), ...patch } });
  }

  _setActionType(roomId, actionKey, type) {
    if (type === 'none') {
      this._updateRoom(roomId, { [actionKey]: { action: 'none' } });
    } else if (type === 'navigate') {
      const cur = this._menuConfig.rooms.find(r => r.id === roomId)?.[actionKey];
      this._updateRoom(roomId, { [actionKey]: { action: 'navigate', navigation_path: cur?.navigation_path ?? '' } });
    } else if (type === 'more-info') {
      const cur = this._menuConfig.rooms.find(r => r.id === roomId)?.[actionKey];
      this._updateRoom(roomId, { [actionKey]: { action: 'more-info', entity: cur?.entity ?? '' } });
    } else {
      this._updateRoom(roomId, { [actionKey]: { action: type } });
    }
  }

  _updateFilter(roomId, filterKey, component, value) {
    const room = this._menuConfig.rooms.find(r => r.id === roomId);
    if (!room) return;
    const parsed = parseFilter(room[filterKey] ?? '');
    parsed[component] = value;
    this._updateRoom(roomId, { [filterKey]: buildFilter(parsed) });
  }

  // ── CSS ───────────────────────────────────────────────────────────────────
  // No static styles – we use light DOM (createRenderRoot returns this),
  // so styles are injected as a <style> tag inside render().
  // All selectors are prefixed with room-navbar-card-editor to avoid leaking.

  _editorStyles() {
    return b`<style>
      room-navbar-card-editor { display: block; }
      room-navbar-card-editor *, room-navbar-card-editor *::before, room-navbar-card-editor *::after { box-sizing: border-box; }
      room-navbar-card-editor .rnc-section { margin-bottom: 20px; }
      room-navbar-card-editor .rnc-section-title {
        font-size: 13px; font-weight: 600; color: var(--primary-text-color);
        text-transform: uppercase; letter-spacing: .5px; margin-bottom: 10px;
      }
      room-navbar-card-editor .rnc-banner { padding: 10px 14px; border-radius: 8px; font-size: 12px; margin-bottom: 14px; line-height: 1.5; }
      room-navbar-card-editor .rnc-banner.rnc-banner--warn { background: rgba(255,152,0,.15); border: 1px solid rgba(255,152,0,.4); }
      room-navbar-card-editor .rnc-banner.rnc-banner--info { background: rgba(33,150,243,.12); border: 1px solid rgba(33,150,243,.35); }
      room-navbar-card-editor .rnc-field-row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
      room-navbar-card-editor .rnc-field-label { flex: 0 0 140px; font-size: 12px; color: var(--secondary-text-color); }
      room-navbar-card-editor .rnc-field-input {
        flex: 1; padding: 7px 10px;
        background: var(--input-fill-color, rgba(255,255,255,0.06));
        color: var(--primary-text-color);
        border: 1px solid var(--divider-color, rgba(255,255,255,0.12));
        border-radius: 6px; font-size: 13px;
      }
      room-navbar-card-editor .rnc-field-input:focus { outline: none; border-color: var(--primary-color); }
      room-navbar-card-editor textarea.rnc-field-input { resize: vertical; font-family: monospace; font-size: 11px; min-height: 80px; }
      room-navbar-card-editor .rnc-sub-title {
        font-size: 11px; font-weight: 600; color: var(--secondary-text-color);
        text-transform: uppercase; letter-spacing: .4px;
        margin: 14px 0 6px; padding-top: 10px;
        border-top: 1px solid var(--divider-color, rgba(255,255,255,0.08));
      }
      room-navbar-card-editor .rnc-room-card {
        border: 1px solid var(--divider-color, rgba(255,255,255,0.1));
        border-radius: 10px; margin-bottom: 8px; overflow: hidden;
      }
      room-navbar-card-editor .rnc-room-header {
        display: flex; align-items: center; gap: 8px; padding: 10px 14px;
        background: rgba(255,255,255,0.04); cursor: pointer; user-select: none;
      }
      room-navbar-card-editor .rnc-room-header:hover { background: rgba(255,255,255,0.07); }
      room-navbar-card-editor .rnc-room-chevron { font-size: 10px; color: var(--secondary-text-color); transition: transform .2s; }
      room-navbar-card-editor .rnc-room-chevron.open { transform: rotate(90deg); }
      room-navbar-card-editor .rnc-room-title { flex: 1; font-size: 13px; font-weight: 500; }
      room-navbar-card-editor .rnc-room-badge {
        font-size: 10px; color: var(--secondary-text-color);
        background: rgba(255,255,255,0.07); border-radius: 4px; padding: 2px 6px;
      }
      room-navbar-card-editor .rnc-btn-delete {
        background: none; border: none; cursor: pointer; font-size: 14px;
        color: var(--error-color, #cf6679); padding: 4px; border-radius: 4px;
      }
      room-navbar-card-editor .rnc-room-body { padding: 14px; }
      room-navbar-card-editor .rnc-btn-primary {
        padding: 10px 20px; background: var(--primary-color); color: #fff;
        border: none; border-radius: 8px; font-size: 14px; font-weight: 600;
        cursor: pointer;
      }
      room-navbar-card-editor .rnc-btn-primary:disabled { opacity: .45; cursor: not-allowed; }
      room-navbar-card-editor .rnc-btn-secondary {
        padding: 6px 12px; background: rgba(255,255,255,0.07);
        color: var(--primary-text-color);
        border: 1px solid var(--divider-color, rgba(255,255,255,0.12));
        border-radius: 6px; font-size: 12px; cursor: pointer;
      }
      room-navbar-card-editor .rnc-save-row { display: flex; align-items: center; gap: 14px; }
      room-navbar-card-editor .rnc-status-ok  { font-size: 13px; color: var(--success-color, #4caf50); }
      room-navbar-card-editor .rnc-status-err { font-size: 13px; color: var(--error-color, #cf6679); }
      room-navbar-card-editor .rnc-empty-rooms {
        font-size: 13px; color: var(--secondary-text-color);
        padding: 20px; text-align: center;
        border: 1px dashed var(--divider-color, rgba(255,255,255,0.1)); border-radius: 8px;
      }
      room-navbar-card-editor ha-entity-picker { display: block; flex: 1; }
      room-navbar-card-editor .rnc-transition-row { display: flex; gap: 8px; }
      room-navbar-card-editor .rnc-transition-row .rnc-field-row { flex: 1; }
      room-navbar-card-editor .rnc-action-block {
        padding: 10px; background: rgba(255,255,255,0.03);
        border: 1px solid rgba(255,255,255,0.07); border-radius: 8px; margin-bottom: 8px;
      }
      room-navbar-card-editor .rnc-action-label { font-size: 11px; color: var(--secondary-text-color); margin-bottom: 6px; }
      room-navbar-card-editor .rnc-filter-panels { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 4px; }
      room-navbar-card-editor .rnc-filter-block {
        flex: 1; min-width: 140px;
        background: rgba(255,255,255,0.03);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 8px; padding: 10px 12px;
      }
      room-navbar-card-editor .rnc-filter-title {
        font-size: 10px; font-weight: 700; text-transform: uppercase;
        letter-spacing: .5px; color: var(--secondary-text-color); margin-bottom: 8px;
      }
      room-navbar-card-editor .rnc-filter-preview-bar {
        width: 100%; height: 32px; border-radius: 5px; margin-bottom: 10px;
        background: linear-gradient(135deg,
          #0d1b2a 0%, #1b3a5c 20%, #2e6da4 40%, #e8a045 60%, #f5d76e 80%, #fff 100%);
        transition: filter .4s ease;
      }
      room-navbar-card-editor .rnc-filter-slider-row { display: flex; align-items: center; gap: 6px; margin-bottom: 3px; }
      room-navbar-card-editor .rnc-filter-prop { flex: 0 0 22px; font-size: 13px; text-align: center; }
      room-navbar-card-editor .rnc-filter-slider { flex: 1; height: 4px; cursor: pointer; accent-color: var(--primary-color); }
      room-navbar-card-editor .rnc-filter-val {
        flex: 0 0 38px; font-size: 10px; text-align: right;
        color: var(--primary-text-color); font-family: monospace;
      }
      room-navbar-card-editor .rnc-filter-raw {
        font-size: 9px; color: var(--secondary-text-color); font-family: monospace;
        margin-top: 7px; word-break: break-all; line-height: 1.4;
        padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.06);
      }
    </style>`;
  }

  // ── Render ────────────────────────────────────────────────────────────────

  render() {
    const configId   = this._config.config_id ?? '';
    const menu       = this._menuConfig;
    const availIds   = (this._availConfigs ?? []).map(c => c.id);
    const otherConfs = (this._availConfigs ?? []).filter(c => c.id !== configId);

    return b`
      ${this._editorStyles()}
      ${!this._backendOk ? b`
        <div class="rnc-banner rnc-banner--warn">
          ⚠️ Integration <strong>Room Navbar</strong> not found.
          Add it via <em>Settings → Integrations</em>.
        </div>
      ` : A}

      ${this._backendOk && configId && !availIds.includes(configId) ? b`
        <div class="rnc-banner rnc-banner--info">
          ✨ Config <strong>${configId}</strong> doesn't exist yet – fill in rooms and click Save.
        </div>
      ` : A}

      <!-- Config ID -->
      <div class="rnc-section">
        <div class="rnc-section-title">Configuration</div>
        <div class="rnc-field-row">
          <label class="rnc-field-label">Config ID</label>
          <input class="rnc-field-input" type="text"
            .value=${configId}
            placeholder="main_navbar"
            @change=${e => this._onConfigIdChange(e.target.value.trim())}>
        </div>

        ${otherConfs.length ? b`
          <div class="rnc-field-row">
            <label class="rnc-field-label">Load existing</label>
            <select class="rnc-field-input"
              @change=${e => { if (e.target.value) this._onLoadExisting(e.target.value); e.target.value = ''; }}>
              <option value="">── select ──</option>
              ${otherConfs.map(c => b`<option value="${c.id}">${c.name} (${c.room_count})</option>`)}
            </select>
          </div>
        ` : A}

        <div class="rnc-field-row">
          <label class="rnc-field-label">Menu name</label>
          <input class="rnc-field-input" type="text"
            .value=${menu?.name ?? configId}
            placeholder="Main Navbar"
            @input=${e => { if (this._menuConfig) this._menuConfig = { ...this._menuConfig, name: e.target.value }; }}>
        </div>
      </div>

      ${menu !== null ? b`
        <!-- Rooms -->
        <div class="rnc-section">
          <div class="rnc-section-title" style="display:flex;justify-content:space-between;align-items:center">
            <span>Rooms (${menu.rooms.length})</span>
            <button class="rnc-btn-secondary" @click=${() => this._addRoom()}>+ Add room</button>
          </div>
          ${menu.rooms.length === 0 ? b`
            <div class="rnc-empty-rooms">No rooms. Click <em>Add room</em> to start.</div>
          ` : A}
          ${menu.rooms.map((room, i) => this._renderRoom(room, i))}
        </div>

        <!-- Save -->
        <div class="rnc-section rnc-save-row">
          <button class="rnc-btn-primary"
            ?disabled=${this._saving}
            @click=${() => this._saveConfig()}>
            ${this._saving ? 'Saving…' : '💾 Save configuration'}
          </button>
          ${this._saveStatus === 'ok' ? b`<span class="rnc-status-ok">✓ Saved</span>` : A}
          ${this._saveStatus === 'err' ? b`<span class="rnc-status-err">✗ Error – check browser console</span>` : A}
        </div>
      ` : b`<div class="rnc-empty-rooms">Loading…</div>`}
    `;
  }

  _renderRoom(room) {
    const open = this._expanded.has(room.id);
    return b`
      <div class="rnc-room-card">
        <div class="rnc-room-header" @click=${e => {
          if (e.target.closest('[data-delete]')) return;
          this._toggleExpand(room.id);
        }}>
          <span class="rnc-room-chevron ${open ? 'open' : ''}">▶</span>
          <span class="rnc-room-title">${room.id || '(unnamed)'}</span>
          ${room.light_entity ? b`<span class="rnc-room-badge">${room.light_entity}</span>` : A}
          <button class="rnc-btn-delete" data-delete="1"
            @click=${e => { e.stopPropagation(); if (confirm(`Delete room "${room.id}"?`)) this._deleteRoom(room.id); }}>
            🗑
          </button>
        </div>
        ${open ? this._renderRoomBody(room) : A}
      </div>
    `;
  }

  _renderRoomBody(room) {
    return b`
      <div class="rnc-room-body">

        <!-- Basic -->
        <div class="rnc-sub-title">Basic</div>
        <div class="rnc-field-row">
          <label class="rnc-field-label">Room ID</label>
          <input class="rnc-field-input" type="text" .value=${room.id}
            placeholder="bedroom"
            @input=${e => this._updateRoom(room.id, { id: e.target.value })}>
        </div>
        <div class="rnc-field-row">
          <label class="rnc-field-label">Light (entity)</label>
          <ha-entity-picker
            .hass=${this.hass}
            .value=${room.light_entity ?? ''}
            allow-custom-entity
            @value-changed=${e => this._updateRoom(room.id, { light_entity: e.detail.value ?? '' })}>
          </ha-entity-picker>
        </div>
        <div class="rnc-field-row">
          <label class="rnc-field-label">Background URL</label>
          <input class="rnc-field-input" type="text" .value=${room.image_url ?? ''}
            placeholder="/local/Dashboards/Rooms/Bedroom.webp"
            @input=${e => this._updateRoom(room.id, { image_url: e.target.value })}>
        </div>
        <div class="rnc-field-row">
          <label class="rnc-field-label">Overlay URL</label>
          <input class="rnc-field-input" type="text" .value=${room.overlay_image_url ?? ''}
            placeholder="/local/.../overlay.webp (optional)"
            @input=${e => this._updateRoom(room.id, { overlay_image_url: e.target.value })}>
        </div>

        <!-- Sensors -->
        <div class="rnc-sub-title">Sensors</div>
        <div class="rnc-field-row">
          <label class="rnc-field-label">Temperature</label>
          <ha-entity-picker
            .hass=${this.hass}
            .value=${room.temp_sensor ?? ''}
            allow-custom-entity
            @value-changed=${e => this._updateRoom(room.id, { temp_sensor: e.detail.value ?? '' })}>
          </ha-entity-picker>
        </div>
        <div class="rnc-field-row">
          <label class="rnc-field-label">Humidity</label>
          <ha-entity-picker
            .hass=${this.hass}
            .value=${room.humidity_sensor ?? ''}
            allow-custom-entity
            @value-changed=${e => this._updateRoom(room.id, { humidity_sensor: e.detail.value ?? '' })}>
          </ha-entity-picker>
        </div>

        <!-- Filters -->
        <div class="rnc-sub-title">Image Filters &amp; Transitions</div>
        <div class="rnc-filter-panels">
          ${this._renderFilterBlock(room, 'filter_off', '🌙 Night / Off')}
          ${this._renderFilterBlock(room, 'filter_on',  '💡 Light ON')}
          ${this._renderFilterBlock(room, 'filter_day', '☀️ Day')}
        </div>
        <div class="rnc-transition-row">
          <div class="rnc-field-row">
            <label class="rnc-field-label">Filter transition</label>
            <input class="rnc-field-input" type="text" .value=${room.transition_filter ?? '1.5s'}
              @input=${e => this._updateRoom(room.id, { transition_filter: e.target.value })}>
          </div>
          <div class="rnc-field-row">
            <label class="rnc-field-label">Overlay transition</label>
            <input class="rnc-field-input" type="text" .value=${room.transition_overlay ?? '2.0s'}
              @input=${e => this._updateRoom(room.id, { transition_overlay: e.target.value })}>
          </div>
        </div>

        <!-- Actions -->
        <div class="rnc-sub-title">Actions</div>
        ${this._renderActionBlock(room, 'tap_action',        'Tap')}
        ${this._renderActionBlock(room, 'hold_action',       'Hold (>500ms)')}
        ${this._renderActionBlock(room, 'double_tap_action', 'Double tap')}
      </div>
    `;
  }

  _renderFilterBlock(room, filterKey, label) {
    const filterStr  = room[filterKey] ?? '';
    const { brightness, saturate, sepia, hueRotate } = parseFilter(filterStr);

    return b`
      <div class="rnc-filter-block">
        <div class="rnc-filter-title">${label}</div>
        <div class="rnc-filter-preview-bar" style="filter:${filterStr}"></div>

        <div class="rnc-filter-slider-row">
          <span class="rnc-filter-prop" title="Brightness">☀</span>
          <input type="range" class="rnc-filter-slider" min="0.1" max="3" step="0.05"
            .value=${String(brightness)}
            @input=${e => this._updateFilter(room.id, filterKey, 'brightness', parseFloat(e.target.value))}>
          <span class="rnc-filter-val">${brightness.toFixed(2)}</span>
        </div>
        <div class="rnc-filter-slider-row">
          <span class="rnc-filter-prop" title="Saturation">🎨</span>
          <input type="range" class="rnc-filter-slider" min="0" max="4" step="0.05"
            .value=${String(saturate)}
            @input=${e => this._updateFilter(room.id, filterKey, 'saturate', parseFloat(e.target.value))}>
          <span class="rnc-filter-val">${saturate.toFixed(2)}</span>
        </div>
        <div class="rnc-filter-slider-row">
          <span class="rnc-filter-prop" title="Sepia">🟫</span>
          <input type="range" class="rnc-filter-slider" min="0" max="1" step="0.05"
            .value=${String(sepia)}
            @input=${e => this._updateFilter(room.id, filterKey, 'sepia', parseFloat(e.target.value))}>
          <span class="rnc-filter-val">${sepia.toFixed(2)}</span>
        </div>
        <div class="rnc-filter-slider-row">
          <span class="rnc-filter-prop" title="Hue rotate">🌈</span>
          <input type="range" class="rnc-filter-slider" min="-180" max="180" step="1"
            .value=${String(Math.round(hueRotate))}
            @input=${e => this._updateFilter(room.id, filterKey, 'hueRotate', parseFloat(e.target.value))}>
          <span class="rnc-filter-val">${Math.round(hueRotate)}°</span>
        </div>

        <div class="rnc-filter-raw">${filterStr || '—'}</div>
      </div>
    `;
  }

  _renderActionBlock(room, actionKey, label) {
    const action    = room[actionKey] ?? { action: 'none' };
    const curType   = action.action ?? 'none';

    return b`
      <div class="rnc-action-block">
        <div class="rnc-action-label">${label}</div>
        <div class="rnc-field-row">
          <label class="rnc-field-label">Action type</label>
          <select class="rnc-field-input"
            .value=${curType}
            @change=${e => this._setActionType(room.id, actionKey, e.target.value)}>
            ${ACTION_TYPES.map(t => b`
              <option value="${t.value}" ?selected=${t.value === curType}>${t.label}</option>
            `)}
          </select>
        </div>

        ${curType === 'navigate' ? b`
          <div class="rnc-field-row">
            <label class="rnc-field-label">Path</label>
            <input class="rnc-field-input" type="text"
              .value=${action.navigation_path ?? ''}
              placeholder="/lovelace/bedroom"
              @input=${e => this._updateAction(room.id, actionKey, { navigation_path: e.target.value })}>
          </div>
        ` : A}

        ${curType === 'more-info' ? b`
          <div class="rnc-field-row">
            <label class="rnc-field-label">Entity</label>
            <ha-entity-picker
              .hass=${this.hass}
              .value=${action.entity ?? ''}
              allow-custom-entity
              @value-changed=${e => this._updateAction(room.id, actionKey, { entity: e.detail.value ?? '' })}>
            </ha-entity-picker>
          </div>
        ` : A}

        ${curType === 'call-service' ? b`
          <div class="rnc-field-row">
            <label class="rnc-field-label">Service JSON</label>
            <textarea class="rnc-field-input" rows="4"
              .value=${JSON.stringify(action, null, 2)}
              @change=${e => { try { this._updateRoom(room.id, { [actionKey]: JSON.parse(e.target.value) }); } catch {} }}>
            </textarea>
          </div>
        ` : A}
      </div>
    `;
  }

  // ── Event handlers ────────────────────────────────────────────────────────

  _onConfigIdChange(newId) {
    if (!newId || newId === this._config.config_id) return;
    this._config     = { ...this._config, config_id: newId };
    this._menuConfig = null;
    if (this.hass) this._loadMenuConfig(newId);
    fireEvent(this, 'config-changed', { config: { ...this._config } });
  }

  _onLoadExisting(id) {
    this._config     = { ...this._config, config_id: id };
    this._menuConfig = null;
    this._loadMenuConfig(id);
    fireEvent(this, 'config-changed', { config: { ...this._config } });
  }
}

// ── Registration ──────────────────────────────────────────────────────────────

if (!customElements.get(CARD_TAG)) {
  customElements.define(CARD_TAG, RoomNavbarCard);
  console.info(
    `%c room-navbar-card %c v${VERSION} `,
    'background:#1976d2;color:#fff;font-weight:700',
    'background:#333;color:#fff',
  );
}

if (!customElements.get(EDITOR_TAG)) {
  customElements.define(EDITOR_TAG, RoomNavbarCardEditor);
}

window.customCards = window.customCards || [];
if (!window.customCards.find(c => c.type === CARD_TAG)) {
  window.customCards.push({
    type:        CARD_TAG,
    name:        'Room Navbar Card',
    description: 'Shared navigation bar with per-room images, filters, temperature and humidity.',
    preview:     true,
  });
}
