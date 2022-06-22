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

function makeValidTextString(text: string): string | undefined {
  const despaced = text.replace(
    /[\r\t\f\v \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+/g,
    " "
  );
  if (despaced.length === 1 && despaced[0] === " ") return;
  if (despaced.length > 0) {
    return despaced.replace(/&nbsp;/g, "\u00a0").replace(/-/g, "\u2011");
  }
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
      const cleaned = makeValidTextString(child.text);
      if (cleaned) {
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
