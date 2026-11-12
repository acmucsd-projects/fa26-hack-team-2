# components

Reusable pieces used in more than one place, like buttons, cards, and the navigation bar.

- Each component gets its own folder, named with a capital letter (`Name/`)
- Inside the folder, make a `.jsx` file and a `.css` file with the same name (`Name.jsx`, `Name.css`)
- Use props for anything that changes each time the component is used
- Style components with tokens from `styles/tokens.css`, not typed-in colors or sizes
- Check this folder before making a new component, in case it already exists