import {
  ElementNode,
  EmbedElement,
  isElement,
  isText,
  Node,
  RichTextContent,
  Text,
} from "@graphcms/rich-text-types";

export function isEmbed(node: Node): node is EmbedElement {
  return isElement(node) && node.type === "embed";
}

function cleanupTextString(text: string) {
  return text.replace(/\s+/g, " ");
}

function isEmptyText(text: string): boolean {
  return text.trim().length === 0;
}

export function cleanupElementNode(
  elementNode: ElementNode
): ElementNode | undefined {
  const { children, ...rest } = elementNode;
  const newChildren: (ElementNode | Text)[] = [];
  children.forEach((child) => {
    if (isText(child)) {
      if (!isEmptyText(child.text)) {
        newChildren.push({ ...child, text: cleanupTextString(child.text) });
      }
    } else if (isElement(child)) {
      const newChild = cleanupElementNode(child);
      if (newChild) {
        newChildren.push(newChild);
      } else if (child.type === "table_cell") {
        // Keep table cells as they are important!
        newChildren.push({ type: child.type, children: [] });
      }
    }
  });
  if (newChildren.length) {
    return { ...rest, children: newChildren };
  }

  if (isEmbed(elementNode)) {
    return { ...rest, children: [] };
  }
}

export function cleanupRTFContent(
  content: RichTextContent
): Array<ElementNode> {
  const elements = Array.isArray(content) ? content : content.children;
  const newElements: ElementNode[] = [];
  elements.forEach((element) => {
    const cleanedElement = cleanupElementNode(element);
    if (cleanedElement) {
      newElements.push(cleanedElement);
    }
  });

  return newElements;
}
