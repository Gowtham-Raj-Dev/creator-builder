"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Layers } from "lucide-react";

export default function NotFound() {
  const [redirecting, setRedirecting] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const path = window.location.pathname;
      const search = window.location.search;
      const hash = window.location.hash;

      // Extract basePath if on GitHub Pages (e.g., /creator-builder)
      const segments = path.split("/").filter(Boolean);
      let basePath = "";
      if (segments.length > 0 && segments[0] === "creator-builder") {
        basePath = "/creator-builder";
        segments.shift();
      }

      if (segments.length === 0) {
        window.location.replace(`${basePath}/builder`);
        return;
      }

      // Case 1: Builder routes (/builder/[app]/...)
      if (segments[0] === "builder") {
        if (segments.length === 1) {
          window.location.replace(`${basePath}/builder`);
          return;
        }

        const app = segments[1];
        // If segments[1] is already 'editor', don't loop
        if (app === "editor") {
          setRedirecting(false);
          return;
        }

        const tab = segments[2] || "forms";
        const id = segments[3] || "";
        let q = `?app=${encodeURIComponent(app)}`;
        if (tab && tab !== "forms") {
          q += `&tab=${encodeURIComponent(tab)}`;
        }
        if (tab === "forms" && id) {
          q += `&tab=forms&form=${encodeURIComponent(id)}`;
        } else if (tab === "reports" && id) {
          q += `&tab=reports&report=${encodeURIComponent(id)}`;
        }

        window.location.replace(`${basePath}/builder/editor${q}${hash}`);
        return;
      }

      // Case 2: Live app routes (/[app]/...)
      const appName = segments[0];

      // If appName is 'app', don't loop
      if (appName === "app") {
        setRedirecting(false);
        return;
      }

      let q = `?app=${encodeURIComponent(appName)}`;

      if (segments[1] === "reports" && segments[2]) {
        q += `&report=${encodeURIComponent(segments[2])}`;
      } else if (segments[1] === "pages" && segments[2]) {
        q += `&page=${encodeURIComponent(segments[2])}`;
      } else if (segments[1]) {
        q += `&form=${encodeURIComponent(segments[1])}`;
        if (segments[2] === "new") {
          q += `&action=new`;
        } else if (segments[2]) {
          q += `&record=${encodeURIComponent(segments[2])}`;
        }
      }

      // Carry over any existing search query parameters
      if (search && search.startsWith("?")) {
        const extraParams = new URLSearchParams(search);
        extraParams.forEach((val, key) => {
          if (!q.includes(`${key}=`)) {
            q += `&${encodeURIComponent(key)}=${encodeURIComponent(val)}`;
          }
        });
      }

      window.location.replace(`${basePath}/app${q}${hash}`);
    } catch (e) {
      console.error("404 routing redirection error:", e);
      setRedirecting(false);
    }
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
      <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 mb-4 shadow-3xs animate-pulse">
        <Layers className="w-6 h-6" />
      </div>
      <h1 className="text-lg font-bold text-slate-900">
        {redirecting ? "Opening Application..." : "Page Not Found"}
      </h1>
      <p className="text-xs text-slate-500 mt-1 max-w-sm">
        {redirecting
          ? "Routing to your application workspace. Please wait a moment."
          : "The requested application or page could not be found."}
      </p>

      {redirecting ? (
        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-blue-600">
          <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <span>Redirecting to Live Runner...</span>
        </div>
      ) : null}

      <div className="mt-8">
        <Link
          href="/builder"
          className="text-xs text-blue-600 hover:text-blue-700 font-medium underline"
        >
          Return to Applications List
        </Link>
      </div>
    </div>
  );
}
