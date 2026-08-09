export function getScrollBoundaryBottom(element) {
  let node = element.parentElement;
  while (node && node !== document.body) {
    const style = getComputedStyle(node);
    if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
      return node.getBoundingClientRect().bottom;
    }
    node = node.parentElement;
  }
  return window.innerHeight;
}

export function dropdownOverflowsBoundary(dropdownElement) {
  const boundary = Math.min(getScrollBoundaryBottom(dropdownElement), window.innerHeight);
  return dropdownElement.getBoundingClientRect().bottom > boundary;
}
