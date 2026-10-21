/// <reference types="vite/client" />
/// <reference types="@modyfi/vite-plugin-yaml/modules" />

declare module '*.tsv' {
	const content: { [column: string]: string }[];
	export default content;
}
