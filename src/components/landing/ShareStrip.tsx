import { useState } from "react";

interface Props {
  headline: string;
  url: string;
}

export default function ShareStrip({ headline, url }: Props) {
  const [copied, setCopied] = useState(false);

  const shareText = `${headline} — See the full picture on AI 4 Society Observatory`;
  const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(url)}`;
  const linkedinUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;

  const copyLink = async () => {
    await navigator.clipboard.writeText(`${headline}\n${url}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const linkClass = "text-[10px] text-gray-500 hover:text-white transition-colors";

  return (
    <div className="flex items-center gap-4">
      <span className="text-[9px] text-gray-600 uppercase tracking-wider">Share</span>
      <a href={twitterUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
        X / Twitter
      </a>
      <a href={linkedinUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
        LinkedIn
      </a>
      <button onClick={copyLink} className={linkClass}>
        {copied ? "Copied!" : "Copy link"}
      </button>
    </div>
  );
}
