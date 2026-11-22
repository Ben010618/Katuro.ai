/**
 * A font size in px that grows with the KaTuro App's text size (Menu → Settings; phoneLook.js
 * sets --kt-px on the page). On the website and KaTuroDesk --kt-px is not set: the size as given.
 */
export const fpx = (n) => `calc(${n}px * var(--kt-px, 1))`;
