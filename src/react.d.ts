// Styles take custom properties of CSS, such as `--fill`, next to the standard ones
// oxlint-disable-next-line unicorn/require-module-specifiers -- only a module augments the types of React
export {};

declare module 'react' {
	interface CSSProperties {
		[property: `--${string}`]: string | number | undefined;
	}
}
