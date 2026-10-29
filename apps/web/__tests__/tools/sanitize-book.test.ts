import { sanitizeBookDocument } from "@tools/reader/reading/sanitizeBook";

const chapter = (body: string) =>
  new DOMParser().parseFromString(
    `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:svg="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
<head><title>Chapter</title><meta http-equiv="refresh" content="0;url=https://evil.example/"/></head>
<body>${body}</body></html>`,
    "application/xhtml+xml",
  );

describe("sanitizeBookDocument", () => {
  it("removes everything in a chapter that could run", () => {
    const doc = chapter(`
      <p onclick="steal()">Text <a href="javascript:steal()">link</a> <a href=" java&#x09;script:steal()">tab</a></p>
      <script>steal()</script>
      <img src="cover.jpg" onerror="steal()"/>
      <iframe srcdoc="&lt;script&gt;steal()&lt;/script&gt;"></iframe>
      <object data="evil.swf"></object>
      <form action="javascript:steal()"><button formaction="javascript:steal()">go</button></form>
      <svg:svg onload="steal()"><svg:script>steal()</svg:script>
        <svg:a xlink:href="javascript:steal()"><svg:text>x</svg:text></svg:a>
        <svg:set attributeName="href" to="javascript:steal()"/>
      </svg:svg>`);
    sanitizeBookDocument(doc);
    const html = new XMLSerializer().serializeToString(doc);
    expect(html).not.toMatch(/steal|<script|<iframe|<object|<form|http-equiv/i);
  });

  it("keeps the book itself", () => {
    const doc = chapter(`<h1 id="c1" class="title">One</h1><p>Text <a href="chapter2.xhtml#p3">next</a></p><img src="images/fig1.png" alt="Figure"/>`);
    sanitizeBookDocument(doc);
    expect(doc.querySelector("h1")?.getAttribute("class")).toBe("title");
    expect(doc.querySelector("a")?.getAttribute("href")).toBe("chapter2.xhtml#p3");
    expect(doc.querySelector("img")?.getAttribute("src")).toBe("images/fig1.png");
    expect(doc.querySelector("title")?.textContent).toBe("Chapter");
  });
});
