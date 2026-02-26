// frontend/src/components/PublishWidget.tsx
"use client";

import { useState } from "react";

interface PublishWidgetProps {
  agentId: string;
  isPublic: boolean;
  onToggle: (newValue: boolean) => Promise<void>;
}

export default function PublishWidget({ agentId, isPublic, onToggle }: PublishWidgetProps) {
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<"link" | "embed" | null>(null);

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://yourdomain.com";
  const widgetUrl = `${baseUrl}/widget/${agentId}`;
  const embedCode = `<iframe\n  src="${widgetUrl}"\n  width="400"\n  height="600"\n  style="border-radius: 12px; border: 1px solid #e5e7eb; box-shadow: 0 4px 6px rgba(0,0,0,0.07);"\n  frameborder="0"\n></iframe>`;

  const handleToggle = async () => {
    setLoading(true);
    await onToggle(!isPublic);
    setLoading(false);
  };

  const copy = (text: string, type: "link" | "embed") => {
    navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="border rounded-xl p-5 space-y-4 bg-white">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-900">Publish & Embed</h3>
          <p className="text-sm text-gray-500">Share your agent as a public chat widget</p>
        </div>
        <button
          onClick={handleToggle}
          disabled={loading}
          className={`relative w-12 h-6 rounded-full transition-colors ${
            isPublic ? "bg-blue-600" : "bg-gray-200"
          }`}
        >
          <span
            className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${
              isPublic ? "translate-x-6" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      {isPublic && (
        <div className="space-y-3 pt-2 border-t">
          {/* Share Link */}
          <div>
            <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">Share Link</label>
            <div className="flex gap-2 mt-1">
              <input
                readOnly
                value={widgetUrl}
                className="flex-1 text-sm bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-700"
              />
              <button
                onClick={() => copy(widgetUrl, "link")}
                className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                {copied === "link" ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>

          {/* Embed Code */}
          <div>
            <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">Embed Code</label>
            <div className="mt-1 bg-gray-900 rounded-lg p-3 relative">
              <pre className="text-xs text-green-400 whitespace-pre-wrap overflow-x-auto">{embedCode}</pre>
              <button
                onClick={() => copy(embedCode, "embed")}
                className="absolute top-2 right-2 px-2 py-1 text-xs bg-gray-700 text-gray-200 rounded hover:bg-gray-600 transition-colors"
              >
                {copied === "embed" ? "Copied!" : "Copy"}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1">Paste this into any website, WordPress, or Shopify page</p>
          </div>
        </div>
      )}

      {!isPublic && (
        <p className="text-sm text-gray-400 italic">Enable publishing to get your share link and embed code.</p>
      )}
    </div>
  );
}