// Additional Node diagnostics; the OS sandbox is the mandatory outbound boundary.
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import dgram from 'node:dgram';
import {syncBuiltinESMExports} from 'node:module';
const counts={externalAttempts:0,allowedLoopbackRequests:0};
globalThis.__workproofNetworkProof=counts;
const isLoopback=h=>['localhost','127.0.0.1','::1','[::1]'].includes(h);
function denied(){counts.externalAttempts++;throw new Error('Isolated Workproof check denied external network');}
const originalFetch=globalThis.fetch;globalThis.fetch=(input,options)=>{const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);if(!isLoopback(url.hostname))return denied();counts.allowedLoopbackRequests++;return originalFetch(input,options);};
for(const api of [http,https])for(const method of ['request','get']){const original=api[method];api[method]=function(...args){const first=args[0];const host=typeof first==='string'||first instanceof URL?new URL(first).hostname:first?.hostname??first?.host??'localhost';if(!isLoopback(host.split(':')[0])&&!isLoopback(host))return denied();return original.apply(this,args);};}
const originalConnect=net.Socket.prototype.connect;net.Socket.prototype.connect=function(...args){const first=args[0];let host;if(Array.isArray(first)){const options=first[0];host=typeof options==='object'?options.host:typeof first[1]==='string'?first[1]:'localhost';if(options?.path)return originalConnect.apply(this,args);}else if(typeof first==='object'){if(first.path)return originalConnect.apply(this,args);host=first.host??'localhost';}else host=typeof args[1]==='string'?args[1]:'localhost';if(!isLoopback(host))return denied();return originalConnect.apply(this,args);};
const originalTls=tls.connect;tls.connect=function(...args){const first=args[0];const host=typeof first==='object'?first.host??'localhost':typeof args[1]==='string'?args[1]:'localhost';if(!isLoopback(host))return denied();return originalTls.apply(this,args);};
dgram.createSocket=denied;
syncBuiltinESMExports();
