import { onRequestOptions as __api_claude_proxy_js_onRequestOptions } from "C:\\Users\\الوليد للكمبيوتر\\Desktop\\مشروع نهائي ان شاء الله\\prog-import-master\\prog-import-master\\functions\\api\\claude-proxy.js"
import { onRequestPost as __api_claude_proxy_js_onRequestPost } from "C:\\Users\\الوليد للكمبيوتر\\Desktop\\مشروع نهائي ان شاء الله\\prog-import-master\\prog-import-master\\functions\\api\\claude-proxy.js"
import { onRequest as __api_claude_proxy_js_onRequest } from "C:\\Users\\الوليد للكمبيوتر\\Desktop\\مشروع نهائي ان شاء الله\\prog-import-master\\prog-import-master\\functions\\api\\claude-proxy.js"

export const routes = [
    {
      routePath: "/api/claude-proxy",
      mountPath: "/api",
      method: "OPTIONS",
      middlewares: [],
      modules: [__api_claude_proxy_js_onRequestOptions],
    },
  {
      routePath: "/api/claude-proxy",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_claude_proxy_js_onRequestPost],
    },
  {
      routePath: "/api/claude-proxy",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_claude_proxy_js_onRequest],
    },
  ]