// Estilos de la zona de trabajo de Estudio (compartidos con Vehículos · identificación masiva).
export const ESTUDIO_CSS = `
/* Estudio · solo reglas propias de la zona de trabajo. Los primitivos (intro, kpis, tbl, select, btn, mini, drawer…) viven en styles/orion-ui.css */
.es{container-type:inline-size;container-name:es;--t-bg:var(--bg);--t-surface:var(--soft);--t-line:var(--line);--t-text:var(--text);--t-text-2:var(--sub);--t-text-3:var(--quiet);--t-blue:var(--blue);--t-blue-2:var(--blue-2);--t-warn:var(--warn)}
.es.ws{display:flex;flex-direction:column;height:calc(100vh - 72px - clamp(28px,3.4cqw,52px) - 40px);min-height:520px}
.es .cs-scroll{flex-shrink:0}
.es .inp{width:100%;min-width:0;background:var(--soft);border:1px solid var(--line);border-radius:5px;padding:11px 14px;font-size:15px;color:var(--text);box-sizing:border-box;outline:none}
.es .inp::placeholder{color:var(--quiet)}
.es .inp:focus{border-color:var(--blue)}
.es textarea.inp{min-height:96px;resize:vertical;line-height:1.55}
.es .mini.flash{border-color:var(--blue);color:var(--blue-2)}
.es .mini[disabled]{opacity:.5;cursor:default}
.es .bar .bf{display:block;height:100%;width:0;background:var(--blue);border-radius:2px;transition:width .85s cubic-bezier(.2,.8,.2,1)}
.es .bar.stp{grid-template-columns:minmax(120px,190px) 1fr 40px}
.es .bar .bn .no{color:var(--quiet);font-variant-numeric:tabular-nums;margin-right:8px}
.es .seg8{display:inline-grid;grid-template-columns:repeat(8,8px);gap:2px;vertical-align:middle}
.es .seg8 i{display:block;height:8px;border-radius:1px;background:var(--line)}
.es .seg8 i.on{background:var(--blue)}
.es .prog{display:inline-flex;align-items:center;gap:10px}
.es .prog b{font-weight:600;font-variant-numeric:tabular-nums;font-size:13.5px;min-width:30px;text-align:left}
.es .tbl td.rowact{text-align:right;white-space:nowrap}
.es .tbl td.rowact .mini{opacity:0;transition:opacity .16s,border-color .16s}
.es .tbl tr:hover td.rowact .mini,.es .tbl td.rowact .mini:focus-visible,.es .tbl td.rowact .rowconf .mini{opacity:1}
.es .rowconf{display:inline-flex;gap:6px}
.es .new-form{margin-top:16px;padding:20px 24px;border:1px solid var(--line);border-radius:6px;background:var(--soft)}
/* espacio de trabajo */
.es .wsbar{display:flex;gap:14px;align-items:center;margin:0 0 clamp(14px,1.6cqw,22px);min-width:0;flex-shrink:0}
.es .opens{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;min-width:0;align-items:center;flex:1}
.es .opens .lb{font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--quiet);white-space:nowrap;flex-shrink:0}
.es .chip{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);border-radius:5px;padding:5px 6px 5px 11px;font-size:13px;font-weight:600;color:var(--sub);white-space:nowrap}
.es .chip[aria-current=true]{border-color:var(--text);color:var(--text)}
.es .chip button{all:unset;cursor:pointer;max-width:170px;overflow:hidden;text-overflow:ellipsis}
.es .chip button.x{padding:0 5px;font-size:17px;line-height:1;color:var(--quiet)}
.es .chip button.x:hover{color:var(--text)}
.es .case{display:flex;justify-content:space-between;align-items:flex-end;gap:18px 24px;flex-wrap:wrap;padding-bottom:20px;flex-shrink:0}
.es .case h1{font-size:clamp(26px,2.6cqw,38px);margin:0 0 8px}
.es .case .over{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--quiet);margin:0 0 8px;font-weight:600}
.es .case .meta{display:flex;gap:6px 18px;flex-wrap:wrap;color:var(--sub);font-size:14.5px;align-items:center}
.es .case .acts{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.es .banner{margin:14px 0 0;padding:12px 16px;border:1px solid var(--line);border-left:3px solid var(--c,var(--blue));border-radius:5px;font-size:14px;color:var(--sub);display:flex;gap:12px;flex-wrap:wrap;align-items:center}
.es .banner b{color:var(--text);letter-spacing:.06em;text-transform:uppercase;font-size:12px}
.es .steps{display:flex;border-top:1px solid var(--line);border-bottom:1px solid var(--line);overflow-x:auto;scrollbar-width:thin;flex-shrink:0}
.es .stp8{all:unset;box-sizing:border-box;flex:1 0 auto;min-width:0;cursor:pointer;padding:15px 10px 13px;text-align:center;font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--quiet);border-bottom:2px solid transparent;margin-bottom:-1px;transition:color .16s,border-color .16s;white-space:nowrap}
.es .stp8:hover{color:var(--text)}
.es .stp8:focus-visible{outline:2px solid var(--blue);outline-offset:-2px}
.es .stp8 b{margin-right:6px;opacity:.7;font-variant-numeric:tabular-nums}
.es .stp8[aria-current=step]{color:var(--text);border-bottom-color:var(--blue)}
.es .stp8 .ok{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--blue);margin-left:7px;vertical-align:middle}
.es .stp8 .op{margin-left:7px;font-size:10.5px;letter-spacing:.06em;color:var(--quiet);font-weight:600}
.es .stepbody{padding:clamp(22px,2.4cqw,34px) 0 10px;min-width:0;overflow-y:auto;flex:1}
.es .sh{display:flex;justify-content:space-between;align-items:flex-end;gap:14px 24px;flex-wrap:wrap;margin-bottom:22px}
.es .sh h2{font-size:clamp(21px,1.8cqw,27px)}
.es .sh h2 b{opacity:.55;margin-right:8px;font-variant-numeric:tabular-nums}
.es .sh p{margin:6px 0 0;color:var(--sub);font-size:14.5px;line-height:1.6;max-width:70ch}
.es .sh .acts{display:flex;gap:10px;flex-wrap:wrap}
.es .twocol{display:grid;grid-template-columns:minmax(0,3fr) minmax(0,2fr);gap:0;border-top:1px solid var(--line);overflow-y:auto;flex:1;min-height:0}
.es .twocol>section{padding:24px 0 20px;min-width:0}
.es .twocol>section:first-child{padding-right:clamp(20px,3cqw,44px)}
.es .twocol>section+section{padding-left:clamp(20px,3cqw,44px);border-left:1px solid var(--line)}
.es .twocol h3,.es .dg-h3{font:600 17px/1.3 var(--font-display);letter-spacing:-.02em;margin:0 0 4px;color:var(--text)}
.es .dg-h3+.dg-h3{margin-top:26px}
.es .dg-sub{font-size:14px;color:var(--sub);margin:0 0 16px}
.es .dg-scroll{padding:24px 0 48px;overflow-y:auto;flex:1;min-height:0}
.es .formgrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px 18px}
.es .formgrid .full{grid-column:1/-1}
.es .dg-fld{display:flex;flex-direction:column;gap:7px}
.es .dg-fld label{font-size:12px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--quiet)}
.es .dg-fld .hint{font-size:12.5px;color:var(--quiet);line-height:1.5;margin-top:3px}
.es .dg-fld .warn{font-size:12.5px;color:var(--warn);min-height:14px;margin-top:2px}
.es .dg-fld .req{color:var(--blue-2)}
.es .dg-inp{width:100%;background:var(--soft);border:1px solid var(--line);border-radius:5px;padding:11px 14px;font-size:15px;color:var(--text);box-sizing:border-box;outline:none;font-family:inherit}
.es .dg-inp:focus{border-color:var(--blue)}
.es .dg-inp::placeholder{color:var(--quiet)}
.es .dg-sel{width:100%;box-sizing:border-box;font-family:inherit}
.es input[type=date]{color-scheme:dark}
[data-theme="light"] .es input[type=date]{color-scheme:light}
.es .dg-kv{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 18px;margin:16px 0}
.es .dg-kv .krow{display:flex;flex-direction:column;gap:5px;padding:12px 0 11px;border-bottom:1px solid var(--line);font-size:15px}
.es .dg-kv label{color:var(--quiet);font-size:12px;letter-spacing:.07em;text-transform:uppercase}
.es .dg-kv .val{color:var(--text)}.es .dg-kv .val.em{color:var(--quiet)}
.es .dg-h3.sp{margin-top:30px}
.es .dg-fld.narrow{max-width:260px}
.es .dg-sel{min-width:0}
.es .pct2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px 18px;margin-top:14px}
.es .dg-note{font-size:13px;color:var(--quiet);line-height:1.6;padding:10px 0 0;border-top:1px solid var(--line);margin-top:12px}
.es .lock{display:flex;gap:6px 14px;flex-wrap:wrap;align-items:baseline;border:1px solid var(--line);border-left:3px solid var(--blue);border-radius:5px;background:var(--soft);padding:12px 16px;margin:0 0 18px;font-size:14px;line-height:1.6;color:var(--sub)}
.es .lock b{color:var(--text);letter-spacing:.07em;text-transform:uppercase;font-size:12px;flex-shrink:0}
.es .notice{margin:0 0 18px;padding:12px 16px;border:1px solid var(--warn);border-radius:5px;font-size:14px;line-height:1.6;color:var(--sub)}
.es .xwrap{overflow:auto;border:1px solid var(--line);border-radius:6px;max-height:520px}
.es .xg{border-collapse:separate;border-spacing:0;font-size:13.5px;min-width:100%;font-variant-numeric:tabular-nums}
.es .xg th{position:sticky;top:0;z-index:2;background:var(--soft);text-align:left;font-size:11.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--head);padding:10px 12px;border-bottom:1px solid var(--line);border-right:1px solid var(--line);white-space:nowrap}
.es .xg td{padding:9px 12px;border-bottom:1px solid var(--line);border-right:1px solid var(--line);white-space:nowrap;color:var(--sub)}
.es .xg th:first-child,.es .xg td:first-child{position:sticky;left:0;z-index:1;background:var(--bg)}
.es .xg th:first-child{z-index:3;background:var(--soft)}
.es .xg td.n,.es .xg th.n{text-align:right}
.es .xg tbody tr:hover td{background:var(--hover)}
.es .xg th.fx{color:var(--blue-2);cursor:pointer}
.es .xg td.fx{color:var(--blue-2)}
.es .xg td.raw{color:var(--sub)}.es .xg td.fix{box-shadow:inset 0 -2px var(--warn)}
.es .idtool{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:0 0 14px}
.es .idtool .search{flex:1 1 260px;max-width:380px}
.es .stat3 button[aria-pressed=true] strong{color:var(--blue-2)}
.es .stat3 button[aria-pressed=true] label{color:var(--text)}
.es .cstate{font-size:12.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase}
.es .cstate.ok{color:var(--blue-2)}.es .cstate.pen{color:var(--warn)}.es .cstate.no{color:var(--quiet)}
.es .grp{font-size:12.5px;color:var(--quiet)}
.es .selbar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:10px 14px;margin:0 0 10px;border:1px solid var(--line);border-radius:5px;background:var(--soft)}
.es .selbar span{margin-right:auto;font-size:14px}.es .selbar.on{border-color:var(--blue)}.es .selbar .pri{background:var(--blue);border-color:var(--blue);color:#fff}
.es .xg tr.sel td{background:var(--hover)}.es .xg tr.sel td:first-child{box-shadow:inset 3px 0 0 var(--blue)}
.es .xg .chk{width:34px;text-align:center!important}
.es .xg .chk input[type=checkbox]{all:unset;box-sizing:border-box;display:inline-block;width:18px;height:18px;padding:0;border:1.5px solid var(--quiet);border-radius:4px;background:transparent;cursor:pointer;vertical-align:middle}
.es .xg .chk input[type=checkbox]:hover{border-color:var(--blue)}
.es .xg .chk input[type=checkbox]:checked{background:var(--blue) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 18 18'%3E%3Cpath d='M4.5 9.5l3 3 6-7' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center/16px no-repeat;border-color:var(--blue)}
.es .xg .chk input[type=checkbox]:focus-visible{outline:2px solid var(--blue);outline-offset:2px}
.es .xg td input:not([type=checkbox]){all:unset;box-sizing:border-box;width:150px;padding:4px 8px;border:1px solid var(--line);border-radius:4px;background:var(--soft);color:var(--text)}
.es .xg td input:not([type=checkbox]):focus{border-color:var(--blue)}
.es .xg td input[readonly]{color:var(--sub)}
.es .xg td.yr input{width:70px;text-align:right}
.es .xg td .mm{display:flex;gap:6px}.es .xg td .mm input{width:140px}.es .xg td .mm input+input{width:170px}
.es .xg td select{all:unset;box-sizing:border-box;cursor:pointer;min-width:200px;max-width:340px;padding:4px 8px;border:1px solid var(--line);border-radius:4px;background:var(--soft);color:var(--text)}
.es .xg td select:focus{border-color:var(--blue)}
.es .xg .selv{display:flex;align-items:center;gap:8px}.es .xg .selv b{font-weight:600}
.es .xg .xbtn{all:unset;cursor:pointer;padding:2px 7px;border:1px solid var(--line);border-radius:4px;color:var(--quiet);font-size:15px;line-height:1.2}
.es .xg .xbtn:hover{color:var(--text);border-color:var(--text)}
.es .xg tr.srchrow td{background:var(--soft)!important;white-space:normal;padding:0}
.es .mdl-wrap{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:var(--scrim,rgba(2,5,16,.6));padding:20px}
.es .mdl{background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:28px 30px;width:min(560px,100%);max-height:84vh;overflow:auto;box-shadow:0 24px 80px rgba(0,0,0,.45)}
.es .mdl-over{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--quiet);margin-bottom:8px}
.es .mdl h3{font:600 24px/1.2 var(--font-display);letter-spacing:-.03em;margin:0 0 10px;color:var(--text)}
.es .mdl-desc{font-size:14.5px;line-height:1.6;color:var(--sub);margin:0 0 16px}
.es .mdl-list{list-style:none;margin:0 0 20px;padding:0;border-top:1px solid var(--line)}
.es .mdl-list li{border-bottom:1px solid var(--line)}
.es .mdl-list label{display:flex;gap:12px;align-items:flex-start;padding:12px 0;cursor:pointer;font-size:14.5px;color:var(--text)}
.es .mdl-list input{margin-top:3px;width:16px;height:16px;accent-color:var(--blue)}
.es .mdl-sub{color:var(--quiet);font-size:13px}
.es .mdl-act{display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap}
.es .mdl-act .pri{background:var(--blue);border-color:var(--blue);color:#fff}
.es .srch{display:grid;gap:10px;padding:14px 16px}
.es .srch .res{display:grid;max-width:760px;max-height:320px;overflow-y:auto}
.es .srch .res>div{display:flex;justify-content:space-between;gap:14px;align-items:center;padding:8px 0;border-bottom:1px solid var(--line);font-size:14px;color:var(--text)}
.es .srch .win{display:block;color:var(--quiet);font-size:12.5px;margin-left:0;white-space:normal}
.es .xg td.ov{background:color-mix(in srgb,var(--warn) 14%,transparent)}
.es .xg td .inp.pm{width:104px;padding:5px 9px;font-size:13.5px;text-align:right;font-variant-numeric:tabular-nums}
.es .xg td.ov .inp.pm{border-color:var(--warn)}
.es .adj .fld{display:flex;flex-direction:column;gap:6px}
.es .adj .fld label{font-size:11.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--head)}
.es .xg tfoot td{position:sticky;bottom:0;background:var(--soft);font-weight:700;border-top:1px solid var(--line)}
.es .xnote{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:12px;font-size:13px;color:var(--quiet)}
.es .stat3{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));border-top:1px solid var(--line);border-bottom:1px solid var(--line);margin:0 0 22px}
.es .stat3 button{all:unset;box-sizing:border-box;cursor:pointer;padding:16px 14px 16px 0;min-width:0;display:block}
.es .stat3 button+button{padding-left:16px;border-left:1px solid var(--line)}
.es .stat3 button:focus-visible{outline:2px solid var(--blue);outline-offset:-2px}
.es .stat3 label{display:block;font-size:12px;letter-spacing:.07em;text-transform:uppercase;color:var(--quiet);margin-bottom:6px;cursor:pointer}
.es .stat3 strong{font:600 clamp(24px,2.2cqw,32px)/1.1 var(--font-display);letter-spacing:-.045em;font-variant-numeric:tabular-nums;color:var(--text)}
.es .stat3 button:hover strong{color:var(--blue-2)}
.es .tri{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));border-top:1px solid var(--line)}
.es .tri>div{padding:22px 22px 22px 0;min-width:0}.es .tri>div+div{padding-left:22px;border-left:1px solid var(--line)}
.es .tri .no{font:600 13px var(--font-body);color:var(--blue-2);letter-spacing:.14em}
.es .tri h3{font:600 17px/1.3 var(--font-display);letter-spacing:-.02em;margin:8px 0 6px;color:var(--text)}
.es .tri p{margin:0 0 14px;color:var(--sub);font-size:14px;line-height:1.6}
.es .drop{border:1px dashed var(--line);border-radius:6px;padding:22px 14px;text-align:center;color:var(--quiet);font-size:14px}
.es .drop.ok{border-style:solid;color:var(--text)}
.es .modes{display:grid;gap:8px}
.es .mode{all:unset;box-sizing:border-box;cursor:pointer;display:block;border:1px solid var(--line);border-radius:6px;padding:12px 14px}
.es .mode b{display:block;font-size:14.5px;color:var(--text)}.es .mode span{display:block;color:var(--quiet);font-size:13px;margin-top:2px}
.es .mode[aria-checked=true]{border-color:var(--blue);background:color-mix(in srgb,var(--blue) 10%,transparent)}
.es .mode.sd[aria-checked=true]{border-color:var(--silver);background:color-mix(in srgb,var(--silver) 10%,transparent)}
.es .pbar{height:8px;background:var(--soft);border-radius:4px;overflow:hidden;margin:14px 0 6px}
.es .pbar i{display:block;height:100%;width:0;background:var(--blue);transition:width .25s linear}
.es .sdline{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:12px;font-size:13.5px;color:var(--sub)}
.es .sdline b.off{color:var(--sdoff)}.es .sdline b.on{color:var(--silver);letter-spacing:.05em;text-transform:uppercase;font-size:12.5px}
.es .mini.sd{border-color:var(--silver);color:var(--silver)}.es .mini.sd:hover{background:color-mix(in srgb,var(--silver) 12%,transparent)}
.es .mini.sdpri{background:var(--silver);border-color:var(--silver);color:#1b1004}
.es .tot{display:flex;gap:6px 36px;flex-wrap:wrap;align-items:baseline;padding:16px 0;border-top:1px solid var(--line)}
.es .tot span{font-size:12px;letter-spacing:.07em;text-transform:uppercase;color:var(--quiet);display:block}
.es .tot strong{font:600 28px/1.2 var(--font-display);letter-spacing:-.04em;font-variant-numeric:tabular-nums;color:var(--text)}
.es .pane{position:absolute;inset:0;flex-direction:column;padding-top:clamp(22px,2.4cqw,34px)}
.es .strip{flex-shrink:0;display:flex;gap:10px 14px;align-items:center;flex-wrap:wrap;margin:0 0 14px;padding:10px 14px;border:1px solid var(--line);border-left:3px solid var(--c,var(--blue));border-radius:5px;font-size:14px;color:var(--sub);line-height:1.5}
.es .strip b{color:var(--text);font-weight:600}
.es .strip.warn{--c:var(--warn)}
.es .strip .sp{margin-left:auto}
.es .ck{display:inline-flex;gap:8px;align-items:center;font-size:13.5px;color:var(--sub);cursor:pointer}
.es .ck input{width:16px;height:16px;accent-color:var(--blue);cursor:pointer}
.es .adj{display:flex;gap:14px 22px;flex-wrap:wrap;align-items:flex-end;margin:0 0 20px}
.es .adj .inp{width:130px;text-align:right}
.es .dropwrap.on{outline:1px dashed var(--blue);outline-offset:6px}
.es .xg td .em{color:var(--quiet)}
.es .infbody{display:block}
.es .paper .kb{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));border-top:1px solid #d8e0eb;border-bottom:1px solid #d8e0eb;margin:14px 0}
.es .paper .kb button{all:unset;cursor:pointer;box-sizing:border-box;padding:12px 10px 12px 0;min-width:0}
.es .paper .kb button+button{padding-left:12px;border-left:1px solid #d8e0eb}
.es .paper .kb label{display:block;font-size:11px;letter-spacing:.07em;text-transform:uppercase;color:#586780;cursor:inherit}
.es .paper .kb strong{font:600 22px/1.2 var(--font-display);letter-spacing:-.04em;color:#18243a;font-variant-numeric:tabular-nums}
.es .paper .kb button:hover strong{color:#265fc9}
.es .paper input.pm{width:96px;text-align:right;font:13px var(--font-body);font-variant-numeric:tabular-nums;border:1px solid #d8e0eb;border-radius:4px;padding:5px 8px;background:#f7f9fd;color:#18243a;outline:0}
.es .paper input.pm:focus{border-color:#265fc9}
.es .paper td.dif.pos{color:#14754d}.es .paper td.dif.neg{color:#b83a32}
.es .paper .warnp{color:#8a5a12;font-size:13.5px;margin:10px 0 0}
.es .paper .edtools{margin:8px 0 0;font-size:12.5px;color:#586780}
.es .paper .fxl{font:12.5px/1.8 ui-monospace,Menlo,Consolas,monospace;color:#33425b;background:#f7f9fd;border:1px solid #e6ebf3;border-radius:4px;padding:10px 14px}
.es .stepscroll{flex:1;overflow-y:auto;min-height:0;padding-bottom:20px}
.es .rowline{display:flex;gap:10px 14px;align-items:center;flex-wrap:wrap}
.es .rowline.between{justify-content:space-between}
.es .rowline.sm{margin:6px 0 0;font-size:13.5px}
.es .rowline .strong,.es .notice .ttl{color:var(--text);font-weight:600}
.es .notice .ttl{display:block;margin-bottom:4px;font-size:14px}
.es .plates{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}
.es .plates span{font-size:12.5px;font-variant-numeric:tabular-nums;border:1px solid var(--line);border-radius:4px;padding:3px 8px;color:var(--sub)}
.es .plates span.muted{border:0}
.es .sdlog{display:grid;margin:10px 0 14px;max-height:170px;overflow-y:auto}
.es .sdlog>div{display:flex;gap:12px;padding:7px 0;border-bottom:1px solid var(--line);font-size:13.5px}
.es .sdlog .pl{font-weight:600;font-variant-numeric:tabular-nums;color:var(--text)}
.es .sdlog .bad .muted{color:var(--warn)}
.es .stat3.mini3{margin:12px 0 14px}
.es .warnTxt{color:var(--warn);font-size:13px;margin:8px 0 0}
.es .tri p+.mini,.es .tri p+.drop,.es .tri p+.modes{margin-top:0}
/* Silverdat: servicio externo. Naranja encendido, rojo apagado */
.es button.sdchip{all:unset;box-sizing:border-box;cursor:pointer;margin-left:auto;display:inline-flex;align-items:center;gap:8px;border:1px solid var(--line);border-radius:5px;padding:6px 12px;font-size:12.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--sdoff);border-color:color-mix(in srgb,var(--sdoff) 55%,var(--line));white-space:nowrap;flex-shrink:0}
.es button.sdchip::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--sdoff);flex-shrink:0}
.es button.sdchip[data-on=true]{border-color:var(--silver);color:var(--silver)}
.es button.sdchip[data-on=true]::before{background:var(--silver);box-shadow:0 0 0 3px color-mix(in srgb,var(--silver) 28%,transparent)}
.es button.sdchip:hover{border-color:var(--text)}
.es button.sdchip:focus-visible{outline:2px solid var(--blue);outline-offset:2px}
/* Informe en papel (siempre claro) */
.es .paper{background:#fff;color:#18243a;border:1px solid var(--line);border-radius:4px;padding:clamp(22px,3cqw,44px);max-width:980px;margin:0 auto;box-shadow:0 20px 60px #0004}
.es .paper .ph{display:flex;justify-content:space-between;gap:20px;border-bottom:2px solid #002F82;padding-bottom:14px;margin-bottom:22px;flex-wrap:wrap}
.es .paper .cl{font:700 20px var(--font-display);letter-spacing:.04em;color:#002F82}
.es .paper .ref{text-align:right;font-size:12.5px;color:#586780;line-height:1.6}
.es .paper h4{font:700 12px var(--font-body);letter-spacing:.14em;text-transform:uppercase;color:#002F82;margin:26px 0 10px}
.es .paper h3{font:600 clamp(20px,2cqw,26px)/1.2 var(--font-display);letter-spacing:-.03em;margin:0 0 4px;color:#18243a}
.es .paper p{font-size:14px;line-height:1.7;margin:0 0 8px;color:#33425b}
.es .paper table{width:100%;border-collapse:collapse;font-size:13px;font-variant-numeric:tabular-nums}
.es .paper th{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#586780;text-align:center;padding:0 6px 8px;border-bottom:1px solid #d8e0eb}
.es .paper td{padding:8px 6px;border-bottom:1px solid #e6ebf3;text-align:center;color:#33425b}
.es .paper th:first-child,.es .paper td:first-child{text-align:left}
.es .paper tfoot td{font-weight:700;border-top:1px solid #18243a;border-bottom:0}
.es .paper textarea{width:100%;min-height:90px;border:1px solid #d8e0eb;border-radius:4px;padding:10px 12px;font:14px/1.6 var(--font-body);color:#18243a;background:#f7f9fd;resize:vertical}
.es .paper .pf{margin-top:24px;padding-top:12px;border-top:1px solid #d8e0eb;display:flex;justify-content:space-between;font-size:11.5px;color:#586780;gap:10px;flex-wrap:wrap}
@container es (max-width:900px){.es .tri,.es .twocol{grid-template-columns:1fr}.es .tri>div,.es .twocol>section:first-child{padding-right:0}.es .tri>div+div,.es .twocol>section+section{padding-left:0;border-left:0;border-top:1px solid var(--line)}}
@container es (max-width:640px){.es .stat3{grid-template-columns:repeat(2,1fr)}.es .formgrid,.es .pct2{grid-template-columns:1fr}.es .case .acts{width:100%}.es .wsbar{flex-wrap:wrap}.es .stp8{min-width:104px;padding:13px 10px 11px;font-size:11.5px}}
.es .stat3>div{padding:16px 14px 16px 0;min-width:0}
.es .stat3>div+div{padding-left:16px;border-left:1px solid var(--line)}
.es .stat3>div label{cursor:default}
.es .s3{max-width:none}
.es .s3tri{margin:6px 0 4px}
.es .s3tri .tot{border-top:0;padding:0}
.es .s3tri .tot strong{font-size:34px}
.es .s3h{font:600 18px/1.25 var(--font-display);letter-spacing:-.03em;margin:30px 0 14px}
.es .s3list{display:grid;gap:10px;margin-top:12px}
.es .s3act{display:flex;gap:12px;margin-top:26px;flex-wrap:wrap}
.es .paper.wide{max-width:none}
/* El configurador de coberturas tiene el mismo formato que la hoja del informe: hoja blanca, tinta azul MMT */
.es .paper.cfgcob{--bg:#fff;--soft:#f7f9fd;--line:#d8e0eb;--text:#18243a;--sub:#33425b;--quiet:#586780;--head:#002F82;--blue:#002F82;--blue-2:#002F82;--hover:#eef2fa;--warn:#b45309;margin:0 0 28px;box-shadow:0 20px 60px #0004}
.es .paper.cfgcob table{font-size:13.5px}
.es .paper.cfgcob .xg th{background:var(--soft);text-align:left;font-size:11.5px;letter-spacing:.06em;padding:10px 12px;border-bottom:1px solid var(--line);color:var(--head)}
.es .paper.cfgcob .xg td{padding:9px 12px;border-bottom:1px solid var(--line);border-right:1px solid var(--line);text-align:left;color:var(--sub)}
.es .paper.cfgcob .xg td:last-child,.es .paper.cfgcob .xg th:last-child{border-right:0}
.es .paper.cfgcob .xwrap{max-height:none}
.es .paper.cfgcob .mini{background:#fff;color:var(--text);border-color:var(--line)}
.es .paper.cfgcob .mini:hover{border-color:var(--blue);color:var(--blue)}
.es .paper.cfgcob .mini.pri{background:var(--blue);border-color:var(--blue);color:#fff}
.es .paper.cfgcob .mini.pri:hover{background:#0a3f9e;color:#fff}
.es .paper.cfgcob .sh p{color:var(--sub)}
.es .cfgcob{margin:0 0 34px}
.es .cfgcob .cfgh{font:600 clamp(19px,1.6cqw,23px)/1.2 var(--font-display);letter-spacing:-.03em;margin:0}
.es .cfgbar{display:flex;gap:10px 14px;flex-wrap:wrap;align-items:flex-end;margin:0 0 12px}
.es .cfgbar .cfgl{display:flex;flex-direction:column;gap:5px;font-size:11.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--head)}
.es .cfgbar .cfgn{font-size:13.5px;color:var(--sub);padding-bottom:8px}
.es .cfgcob select{all:unset;box-sizing:border-box;cursor:pointer;min-width:170px;max-width:300px;padding:6px 32px 6px 10px;border:1px solid var(--line);border-radius:4px;font-size:13.5px;font-weight:400;letter-spacing:0;text-transform:none;color:var(--text);background:var(--soft) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16' fill='none' stroke='%23909db4' stroke-width='1.6' stroke-linecap='round'%3E%3Cpath d='M2 4h12M4 8h8M6.5 12h3'/%3E%3C/svg%3E") no-repeat right 9px center}
.es .cfgcob select:focus-visible{border-color:var(--blue);outline:2px solid var(--blue);outline-offset:1px}
.es .cfgcob select:disabled{opacity:.45;cursor:not-allowed}
.es .cfgcob .cfgt td{vertical-align:middle}
.es .cfgcob .cfgt td:nth-child(3){white-space:normal;max-width:170px;line-height:1.4}
.es .cfgcob .cfgt td:nth-child(5) select{min-width:200px}
.es .cfgcob .cfgt td:nth-child(6) select{min-width:112px;width:122px}
.es .cfgcob .edtools{margin:10px 0 0;font-size:12.5px;color:var(--quiet);line-height:1.6}
.es .cfgcob .cfgt td.chk,.es .cfgcob .cfgt th.chk{text-align:center}
.es .cfgcob .cfgt td:nth-child(n+3):not(:nth-child(7)),.es .cfgcob .cfgt th:nth-child(n+3):not(:nth-child(7)){text-align:center}
.es .cfgcob .cfgt td:nth-child(n+3):not(:nth-child(7)) select{text-align:left}
.es .cfgcob .cfgcat{color:var(--quiet);font-size:12.5px}
.es .cfgcob .cfgmut{color:var(--quiet)}
.es .cfgcob button.cfglink{all:unset;cursor:pointer;color:var(--blue-2);max-width:300px;white-space:normal;line-height:1.45;font-size:13px;text-align:left}
.es .cfgcob button.cfglink:hover{text-decoration:underline}
.es .cfgcob button.cfglink:focus-visible{outline:2px solid var(--blue);outline-offset:2px}
.es .cfgst{display:inline-flex;align-items:center;gap:7px;font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;white-space:nowrap}
.es .cfgst::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--quiet);flex-shrink:0}
.es .cfgst.confirmada{color:var(--blue-2)}.es .cfgst.confirmada::before{background:var(--blue)}
.es .cfgst.propuesta,.es .cfgst.falta{color:var(--warn)}.es .cfgst.propuesta::before,.es .cfgst.falta::before{background:var(--warn)}
.es .cfgst.no_admitida{color:var(--quiet)}
.es .cfgcob .cfgaviso{margin:0 0 12px;padding:10px 14px;border:1px solid var(--line);border-left:3px solid var(--blue);border-radius:5px;background:var(--soft);font-size:13.5px;color:var(--sub);line-height:1.55}
.es .sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.es .emlist{margin:8px 0 0;padding:0 0 0 20px;font-size:14px;line-height:1.7;color:var(--sub)}
.es .emlist-avisos{margin:0 0 4px;padding:12px 16px 12px 34px;border:1px solid var(--line);border-radius:5px;background:var(--soft)}
.es .emprev tr.clk{cursor:pointer}
.es .emprev tr.clk:focus-visible{outline:2px solid var(--blue);outline-offset:-2px}
.es .emprev td:nth-child(n+2),.es .emprev th:nth-child(n+2){text-align:center}
.es .emprev td.n,.es .emprev th.n{text-align:right}
.es .emprev .cfgst{white-space:normal;max-width:300px}
`;
