import type { Line } from './lines';

export interface ListNode {
	line: number;
	depth: number;
	indent: number;
	markerFrom: number;
	parent: ListNode | null;
	children: ListNode[];
	/** The list this item belongs to: its parent's children, or the top-level items. */
	siblings: ListNode[];
	/** Last line of the item's own text (the item line plus lazy continuation lines). */
	textEndLine: number;
	/** Last non-blank line of the item including everything nested below it. */
	lastLine: number;
}

/**
 * Builds the list items of a note and returns, for every line, the item it belongs to:
 * the item itself, a continuation line of its text, or a paragraph or code block nested in it.
 */
export function buildListTree(lines: readonly Line[]): (ListNode | null)[] {
	const owner: (ListNode | null)[] = lines.map(() => null);
	let stack: ListNode[] = [];
	let roots: ListNode[] | null = null;
	let prevBlank = false;
	let textOpen = false;
	let quoteDepth = 0;
	let fenceOwner: ListNode | null = null;

	const top = () => stack[stack.length - 1];
	const popTo = (indent: number) => {
		while (stack.length > 0 && top()!.indent >= indent) stack.pop();
	};
	const reset = () => {
		stack = [];
		roots = null;
		textOpen = false;
	};
	const assign = (index: number, node: ListNode) => {
		owner[index] = node;
		for (let n: ListNode | null = node; n; n = n.parent) n.lastLine = index;
	};

	for (const line of lines) {
		const i = line.index;
		if (line.kind === 'blank') {
			prevBlank = true;
			textOpen = false;
			continue;
		}
		if (line.quoteDepth !== quoteDepth) {
			reset();
			quoteDepth = line.quoteDepth;
		}
		switch (line.kind) {
			case 'list': {
				popTo(line.indent);
				const parent = top() ?? null;
				if (!parent && !roots) roots = [];
				const siblings: ListNode[] = parent ? parent.children : roots!;
				const node: ListNode = {
					line: i,
					depth: parent ? parent.depth + 1 : 0,
					indent: line.indent,
					markerFrom: line.textFrom,
					parent,
					children: [],
					siblings,
					textEndLine: i,
					lastLine: i,
				};
				siblings.push(node);
				stack.push(node);
				assign(i, node);
				textOpen = true;
				break;
			}
			case 'text': {
				if (stack.length === 0) {
					roots = null;
					break;
				}
				if (!prevBlank) {
					// Lazy continuation of the item text, or of a paragraph inside the item.
					if (textOpen) top()!.textEndLine = i;
					assign(i, top()!);
					break;
				}
				popTo(line.indent);
				if (stack.length === 0) {
					reset();
					break;
				}
				assign(i, top()!);
				textOpen = false;
				break;
			}
			case 'fence':
			case 'code': {
				if (line.fenceOpen === i) {
					fenceOwner = null;
					popTo(line.indent);
					if (stack.length > 0) fenceOwner = top()!;
					else reset();
				}
				if (fenceOwner) assign(i, fenceOwner);
				if (line.kind === 'fence' && line.fenceOpen !== i) fenceOwner = null;
				textOpen = false;
				break;
			}
			default:
				reset();
		}
		prevBlank = false;
	}
	return owner;
}
