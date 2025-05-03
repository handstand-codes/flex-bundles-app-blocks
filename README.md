# Flex Bundles App Blocks

This repository contains the official app blocks used in the Flex Bundles app. These blocks can be directly copied and customized for your own projects, or simply used as a reference.

## Overview

The repository contains two types of blocks:

1. **Fixed Blocks** (`fixed-v1.liquid`)
   - Used with fixed product and fixed variant bundles

2. **Dynamic Blocks** (`dynamic-v1.liquid`)
   - Used with dynamic bundles

## Directory Structure

```
├── blocks/               # Main app blocks
│   ├── fixed-v1.liquid   # Fixed bundle implementation
│   └── dynamic-v1.liquid # Dynamic bundle implementation
├── assets/               # Supporting assets (images, styles, etc.)
└── snippets/             # Reusable code snippets
```

## Usage

### As Reference
You can use these blocks as a reference to understand:
- How to structure your own bundle implementations
- Best practices for handling bundle logic
- Integration patterns with Shopify's Liquid templating, and demonstrating how we access the bundle configuration metafield data

### Direct Implementation
You can directly copy and use these blocks in your own projects by:
1. Copying the desired block file from the `blocks/` directory, and adding it as a section in the `sections/` directory within your theme
2. Add the assets and snippets to your theme's `assets/` and `snippets/` directories respectively
3. Customizing the section to match your specific needs

## Getting Started

1. **Choose Your Block Type**
   - Select either fixed or dynamic based on your needs
   - Consider your store's bundle requirements

2. **Implementation**
   - Copy the block file to your theme
   - Customize the settings and configurations
   - Test the implementation in your store

3. **Customization**
   - Modify the styling to match your theme
   - Adjust the bundle logic as needed
   - Add or remove features based on requirements

## Best Practices

- Keep a backup of your original theme files
- Always use Shopify's Github integration
- Document any customizations you make
- Consider performance implications

## Support

For issues or questions:
- Check the block documentation
- Review the implementation examples
- Consider reaching out to the Flex Bundles team

## License

These blocks are provided as-is for reference and implementation purposes.

## Contributing

While these are official app blocks, we welcome feedback and suggestions for improvements. Please create an issue or pull request if you have enhancements to propose. 

In the future, as I add improvements, I'm going to add versioned releases for reference purposes.
