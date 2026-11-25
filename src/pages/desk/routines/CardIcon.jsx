import { createElement } from 'react';
import { iconFor } from './cardStyle';

/** A card's picture (lucide icon by the catalog's name). */
export default function CardIcon({ name, size = 20 }) {
  return createElement(iconFor(name), { size, 'aria-hidden': true });
}
