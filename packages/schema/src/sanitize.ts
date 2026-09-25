import sanitizeHtml from "sanitize-html";

/** Keep admin-authored content useful while removing active content and unsafe URLs. */
export const MAX_SAFE_HTML_LENGTH = 200_000;

const options: sanitizeHtml.IOptions = {
  allowedTags: [
    "a", "abbr", "b", "blockquote", "br", "code", "del", "em", "figcaption", "figure",
    "h1", "h2", "h3", "h4", "hr", "i", "img", "li", "ol", "p", "pre", "s", "small",
    "span", "strong", "sub", "sup", "table", "tbody", "td", "tfoot", "th", "thead", "tr", "u", "ul",
  ],
  allowedAttributes: {
    a: ["href", "title", "target", "rel"],
    blockquote: ["cite"],
    img: ["src", "alt", "title", "width", "height", "loading"],
    td: ["colspan", "rowspan"],
    th: ["colspan", "rowspan", "scope"],
    "*": ["dir", "lang"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesByTag: {
    img: ["http", "https"],
  },
  allowProtocolRelative: false,
  disallowedTagsMode: "discard",
  enforceHtmlBoundary: true,
  transformTags: {
    a: (_tagName, attribs) => ({
      tagName: "a",
      attribs: {
        ...attribs,
        ...(attribs.target === "_blank" ? { rel: "noopener noreferrer" } : {}),
      },
    }),
  },
};

/** Sanitize rich/custom HTML at both persistence and render boundaries. */
export function sanitizeAdminHtml(input: string, maxLength = MAX_SAFE_HTML_LENGTH): string {
  const bounded = input.length > maxLength ? input.slice(0, maxLength) : input;
  return sanitizeHtml(bounded, options);
}
