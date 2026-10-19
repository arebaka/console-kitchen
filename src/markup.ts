import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import ini from 'highlight.js/lib/languages/ini';
import json from 'highlight.js/lib/languages/json';
import powershell from 'highlight.js/lib/languages/powershell';
import { Marked } from 'marked';

hljs.registerLanguage('bash', bash);
hljs.registerLanguage('ini', ini);
hljs.registerLanguage('json', json);
hljs.registerLanguage('powershell', powershell);

// Languages of the generated files by extension, other files stay plain
const LANGUAGES: { [extension: string]: string } = {
	sh: 'bash',
	ps1: 'powershell',
	ini: 'ini',
	config: 'ini',
	locations: 'ini',
	toml: 'ini',
	json: 'json',
};

const escape = (text: string) =>
	text
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');

// Code highlighted as the language, escaped as it is for languages highlight.js does not know
const highlightCode = (code: string, language?: string) =>
	language && hljs.getLanguage(language)
		? hljs.highlight(code, { language }).value
		: escape(code);

// Highlighted HTML of a generated file
export function highlight(content: string, path: string): string {
	return highlightCode(
		content,
		LANGUAGES[path.split('.').pop()?.toLowerCase() ?? ''],
	);
}

// The readme carries versions and names from release metadata, so raw HTML stays text and links only lead to the web
const MARKDOWN = new Marked({
	gfm: true,
	renderer: {
		html: ({ text }) => escape(text),
		link({ href, title, tokens }) {
			const text = this.parser.parseInline(tokens);
			return /^https?:\/\//i.test(href)
				? `<a href="${escape(href)}"${title ? ` title="${escape(title)}"` : ''} target="_blank" rel="noreferrer">${text}</a>`
				: text;
		},
		code: ({ text, lang }) =>
			`<pre class="code"><code>${highlightCode(text, lang)}</code></pre>`,
	},
});

// HTML of the readme
export function renderMarkdown(content: string): string {
	return MARKDOWN.parse(content, { async: false });
}
