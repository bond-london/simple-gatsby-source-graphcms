import {
  ElementNode,
  EmbedElement,
  ImageElement,
  isElement,
  isText,
  Node,
  RichTextContent,
  Text,
} from "@graphcms/rich-text-types";

export function isEmbed(node: Node): node is EmbedElement {
  return isElement(node) && node.type === "embed";
}

export function isImage(node: Node): node is ImageElement {
  return isElement(node) && node.type === "image";
}

function cleanupTextString(text: string) {
  return text
    .replace(/\s+/g, " ")
    .replace(/&nbsp;/g, "\u00a0")
    .replace(/-/g, "\u2011");
}

function isEmptyText(text: string): boolean {
  return text.trim().length === 0;
}

const keepEmpty: { [name: string]: boolean } = {
  table_header_cell: true,
  table_cell: true,
};

export function cleanupElementNode(
  elementNode: ElementNode
): ElementNode | undefined {
  const { children, ...rest } = elementNode;
  const newChildren: (ElementNode | Text)[] = [];
  children.forEach((child) => {
    if (isText(child)) {
      const cleaned = cleanupTextString(child.text);
      if (!isEmptyText(cleaned)) {
        newChildren.push({ ...child, text: cleaned });
      }
    } else if (isElement(child)) {
      const newChild = cleanupElementNode(child);
      if (newChild) {
        newChildren.push(newChild);
      } else if (keepEmpty[child.type]) {
        // Keep table cells as they are important!
        newChildren.push({ type: child.type, children: [] });
      }
    }
  });
  if (newChildren.length || isEmbed(elementNode) || isImage(elementNode)) {
    return { ...rest, children: newChildren };
  }

  if (isEmbed(elementNode)) {
    return { ...rest, children: [] };
  }
  if (isImage(elementNode)) {
    return { ...rest, children: [] };
  }
}

export function cleanupRTFContent(
  content: RichTextContent
): Array<ElementNode> | undefined {
  const elements = Array.isArray(content) ? content : content.children;
  const newElements: ElementNode[] = [];
  elements.forEach((element) => {
    const cleanedElement = cleanupElementNode(element);
    if (cleanedElement) {
      newElements.push(cleanedElement);
    }
  });

  if (newElements.length) {
    return newElements;
  }
}
