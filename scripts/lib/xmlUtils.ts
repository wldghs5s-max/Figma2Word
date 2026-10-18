export interface XmlNode {
  name: string;
  attributes: Record<string, string>;
  children: XmlNode[];
  text?: string;
  parent?: XmlNode;
}

export function parseXmlString(xml: string): XmlNode {
  const root: XmlNode = { name: "__ROOT__", attributes: {}, children: [] };
  const stack: XmlNode[] = [root];

  // Regex matching XML tags and text
  // 1: full tag with <...>, or text
  const tagRegex = /<([/!?]?)([\w:.-]+)([^>]*?)(\/?)>|([^<]+)/g;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(xml)) !== null) {
    const [fullMatch, isClosingOrSpecial, tagName, attrString, isSelfClosing, textContent] = match;

    if (textContent !== undefined) {
      const text = textContent.trim();
      if (text.length > 0) {
        const current = stack[stack.length - 1];
        current.text = (current.text ? current.text + " " : "") + unescapeXml(text);
      }
      continue;
    }

    if (isClosingOrSpecial === "!" || isClosingOrSpecial === "?") {
      // Comment, CDATA, or XML declaration - skip
      continue;
    }

    if (isClosingOrSpecial === "/") {
      // Closing tag
      if (stack.length > 1 && stack[stack.length - 1].name === tagName) {
        stack.pop();
      }
      continue;
    }

    // Opening or self-closing tag
    const attributes = parseAttributes(attrString);
    const node: XmlNode = {
      name: tagName,
      attributes,
      children: [],
      parent: stack[stack.length - 1],
    };

    stack[stack.length - 1].children.push(node);

    if (isSelfClosing !== "/") {
      stack.push(node);
    }
  }

  return root;
}

function parseAttributes(attrString: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  if (!attrString) return attrs;

  const attrRegex = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match: RegExpExecArray | null;
  while ((match = attrRegex.exec(attrString)) !== null) {
    attrs[match[1]] = unescapeXml(match[2] !== undefined ? match[2] : match[3]);
  }
  return attrs;
}

function unescapeXml(str: string): string {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

export function findDescendants(node: XmlNode, predicate: (n: XmlNode) => boolean): XmlNode[] {
  const results: XmlNode[] = [];
  function recurse(n: XmlNode) {
    if (predicate(n)) {
      results.push(n);
    }
    for (const child of n.children) {
      recurse(child);
    }
  }
  for (const child of node.children) {
    recurse(child);
  }
  return results;
}

export function findChild(node: XmlNode, predicate: (n: XmlNode) => boolean): XmlNode | undefined {
  return node.children.find(predicate);
}

export function getAttribute(node: XmlNode, attrName: string): string | undefined {
  if (node.attributes[attrName] !== undefined) {
    return node.attributes[attrName];
  }
  // Try case-insensitive or without namespace
  for (const [k, v] of Object.entries(node.attributes)) {
    if (k.toLowerCase() === attrName.toLowerCase() || k.endsWith(":" + attrName)) {
      return v;
    }
  }
  return undefined;
}

