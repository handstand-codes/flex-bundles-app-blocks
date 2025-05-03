window.FlexBundles = window.FlexBundles || {};

// Define all custom events in one place
window.FlexBundles.EVENTS = {
  AFTER_ADD_TO_CART: "flex-bundles:after-add-to-cart",
  VARIANT_CHANGED: "flex-bundles:variant-changed",
  BUNDLE_COMPONENT_UPDATED: "flex-bundles:component-updated"
};

// Track bundle types across the page
window.FlexBundles.bundleInstances = {
  'fixed-product': [],
  'dynamic': []
};

window.FlexBundles.initBundle = (blockId) => {
  const node = document.getElementById(`flex-bundles-${blockId}`);
  if (!node) return;

  let data = JSON.parse(node.querySelector('[js-flex-bundles-data]').textContent);
  let bundleConfig = data.config;
  let bundleProducts = data.products;
  let parentProductData = data.parent;
  let collectionProducts = data.collections;
  
  // Track bundle instances by type
  let bundleType = bundleConfig?.bundle_type || '';

  if (bundleType && window.FlexBundles.bundleInstances[bundleType]) {
    window.FlexBundles.bundleInstances[bundleType].push(blockId);
    
    // Check for multiple fixed bundles on the page
    if (bundleType === 'fixed-product' && window.FlexBundles.bundleInstances['fixed-product'].length > 1) {
      console.warn('Multiple fixed bundles detected on the page. Only one fixed bundle is recommended.');
      alert('Multiple fixed bundles detected on the page. This may cause unexpected behavior.');
    }

    // Check for multiple dynamic bundles on the page
    if (bundleType === 'dynamic' && window.FlexBundles.bundleInstances['dynamic'].length > 1) {
      console.warn('Multiple dynamic bundles detected on the page. Only one dynamic bundle is recommended.');
      alert('Multiple dynamic bundles detected on the page. This may cause unexpected behavior.');
    }
  }

  /**
   * Data structure overview:
   * - bundleProducts: Object mapping product IDs to product objects
   *   Each product object contains product data (title, handle, etc) and a variants array
   * - bundleConfig: Configuration for the bundle (components, settings, etc)
   * - parentProductData: Data for the parent product that contains this bundle
   */

  // Utility for safely accessing product variants
  const getVariants = productId => (bundleProducts[productId]?.variants || []);

  // Helper functions for price calculations
  function toDollars(cents) {
    return (cents / 100).toFixed(2);
  }

  function formatMoney(dollars) {
    return "$" + parseFloat(dollars).toFixed(2);
  }

  // Create a global state object to track selected variants and their prices
  const bundleState = {
    selectedVariants: {},
    quantityInputs: {}, // Cache for quantity inputs

    // Cache a quantity input for a component
    cacheQuantityInput(componentId, input) {
      this.quantityInputs[componentId] = input;
    },

    setVariant(componentId, variant, quantity) {
      if (!variant) {
        console.error('Attempted to set invalid variant for component:', componentId);
        return;
      }

      // Ensure product_id is set
      if (!variant.product_id) {
        console.warn('Variant without product_id for component:', componentId);
        variant.product_id = componentId.split('_')[0];
      }

      // For dynamic bundles or fixed bundles with quantity adjustments enabled, use passed quantity
      if (bundleConfig.bundle_type === 'dynamic' || bundleConfig.advanced_settings.allow_quantity_adjustments) {
        variant.quantity = quantity || 1;
      } else {
        // For fixed bundles without quantity adjustments, get quantity from bundle config
        const component = bundleConfig.components.find(c => c.component_id === componentId);
        variant.quantity = component?.quantity ? parseInt(component.quantity) : 1;
      }
      
      if (bundleConfig && bundleConfig.components) {
        const component = bundleConfig.components.find(c => c.component_id === componentId);
        if (component?.discount) {
          variant.discount = component.discount;
        }
      }

      this.selectedVariants[componentId] = variant;
    },

    // Get the currently selected variant for a product
    getVariant(productId) {
      return this.selectedVariants[productId];
    },

    // Calculate bundle prices based on selected variants
    calculatePrices() {
      let originalPriceCents = 0;
      let discountedPriceCents = 0;

      // First calculate base price based on price_type
      if (bundleConfig?.price_type === "parent") {
        // Use parent product price
        originalPriceCents = parentProductData.price;
        discountedPriceCents = originalPriceCents;
      } else if (bundleConfig?.price_type === "sum") {
        // Sum up prices of all selected variants
        Object.values(this.selectedVariants).forEach((variant) => {
          if (variant && variant.price) {
            
            const quantity = variant.quantity || 1;
            // Convert price to cents before multiplying by quantity
            const variantPriceCents = Math.round(variant.price) * quantity;
            originalPriceCents += variantPriceCents;
          }
        });
        discountedPriceCents = originalPriceCents;
      }

      // Then apply discount based on discount_config type
      const { type: discountType, value: discountValue } =
        bundleConfig?.discount_config || {};

      switch (discountType) {
        case "percentage": {
          const discountPercent = parseFloat(discountValue || 0);
          const discountMultiplier = 1 - discountPercent / 100;
          discountedPriceCents = Math.round(
            originalPriceCents * discountMultiplier,
          );
          break;
        }
        case "fixed": {
          const discountAmountCents = Math.round(discountValue * 100);
          discountedPriceCents = Math.max(
            0,
            originalPriceCents - discountAmountCents,
          );
          break;
        }
        case "fixed-by-position": {
          // Reset discounted price for per-product calculations
          discountedPriceCents = 0;
          
          // Sort variants by price from highest to lowest
          const sortedVariants = Object.entries(this.selectedVariants)
            .map(([componentId, variant]) => ({
              componentId,
              variant,
              price: variant.price || 0
            }))
            .sort((a, b) => b.price - a.price);

          // Apply position-based discounts
          sortedVariants.forEach((item, index) => {
            if (item.variant && item.variant.price) {
              const quantity = item.variant.quantity || 1;
              const variantPriceCents = item.variant.price * quantity;
              
              // Get discount from position_discounts array or fall back to default value
              const discount = bundleConfig.position_discounts?.[index] ?? discountValue ?? 0;
              
              // Store the discount amount in the variant for display
              this.selectedVariants[item.componentId].discount = discount;
              
              const discountCents = Math.round(discount * 100) * quantity;
              discountedPriceCents += Math.max(0, variantPriceCents - discountCents);
            }
          });
          break;
        }
        case "percentage-by-position": {
          // Reset discounted price for per-product calculations
          discountedPriceCents = 0;
          
          // Sort variants by price from highest to lowest
          const sortedVariants = Object.entries(this.selectedVariants)
            .map(([componentId, variant]) => ({
              componentId,
              variant,
              price: variant.price || 0
            }))
            .sort((a, b) => b.price - a.price);

          // Apply position-based discounts
          sortedVariants.forEach((item, index) => {
            if (item.variant && item.variant.price) {
              const quantity = item.variant.quantity || 1;
              const variantPriceCents = item.variant.price * quantity;
              
              // Get discount from position_discounts array or fall back to default value
              const discount = bundleConfig.position_discounts?.[index] ?? discountValue ?? 0;
              
              // Store the discount percentage in the variant for display
              this.selectedVariants[item.componentId].discount = discount;
              
              const discountMultiplier = 1 - discount / 100;
              discountedPriceCents += Math.round(variantPriceCents * discountMultiplier);
            }
          });
          break;
        }
        case "percentage-by-product": {
          // Reset discounted price for per-product calculations
          discountedPriceCents = 0;
          Object.entries(this.selectedVariants).forEach(
            ([productId, variant]) => {
              
              if (variant && variant.price) {
                const quantity = variant.quantity || 1;
                const variantPriceCents = variant.price * quantity;
                if (variant?.discount) {
                  const discountMultiplier = 1 - variant.discount / 100;
                  discountedPriceCents += Math.round(
                    variantPriceCents * discountMultiplier,
                  );
                } else {
                  discountedPriceCents += variantPriceCents;
                }
              }
            },
          );
          break;
        }
        case "fixed-by-product": {
          // Reset discounted price for per-product calculations
          discountedPriceCents = 0;
          Object.entries(this.selectedVariants).forEach(
            ([productId, variant]) => {
              if (variant && variant.price) {
                const quantity = variant.quantity || 1;
                const variantPriceCents = variant.price * quantity;
                if (variant?.discount) {
                  const discountCents =
                    Math.round(variant.discount * 100) * quantity;
                  discountedPriceCents += Math.max(
                    0,
                    variantPriceCents - discountCents,
                  );
                } else {
                  discountedPriceCents += variantPriceCents;
                }
              }
            },
          );
          break;
        }
        case "progressive-percentage-quantity": {
          const tiers = bundleConfig.progressive_tiers || [];
          const totalQuantity = Object.values(this.selectedVariants).reduce(
            (total, variant) => total + (variant?.quantity || 0), 0
          );
          
          const matchingTiers = tiers.filter((t) => t?.minimum <= totalQuantity);
          const matchingTier = matchingTiers.reduce((highest, current) => 
            (!highest || current?.minimum > highest?.minimum) ? current : highest, 
            null
          );

          if (matchingTier?.discount) {
            const discountPercent = parseFloat(matchingTier.discount);
            const discountMultiplier = 1 - (discountPercent / 100);
            discountedPriceCents = Math.round(originalPriceCents * discountMultiplier);
          } else {
            discountedPriceCents = originalPriceCents;
          }
          break;
        }
        case "progressive-fixed-quantity": {
          const tiers = bundleConfig.progressive_tiers || [];
          const totalQuantity = Object.values(this.selectedVariants).reduce(
            (total, variant) => total + (variant?.quantity || 0), 0
          );
          
          const matchingTiers = tiers.filter((t) => t?.minimum <= totalQuantity);
          const matchingTier = matchingTiers.reduce((highest, current) => 
            (!highest || current?.minimum > highest?.minimum) ? current : highest, 
            null
          );

          if (matchingTier?.discount) {
            const discountCents = Math.round(matchingTier.discount * 100);
            discountedPriceCents = Math.max(0, originalPriceCents - discountCents);
          } else {
            discountedPriceCents = originalPriceCents;
          }
          break;
        }
        case "progressive-percentage-price": {
          const tiers = bundleConfig.progressive_tiers || [];
          const totalPriceCents = originalPriceCents;
          
          const matchingTiers = tiers.filter((t) => t?.minimum * 100 <= totalPriceCents);
          const matchingTier = matchingTiers.reduce((highest, current) => 
            (!highest || current?.minimum > highest?.minimum) ? current : highest, 
            null
          );

          if (matchingTier?.discount) {
            const discountPercent = parseFloat(matchingTier.discount);
            const discountMultiplier = 1 - (discountPercent / 100);
            discountedPriceCents = Math.round(originalPriceCents * discountMultiplier);
          } else {
            discountedPriceCents = originalPriceCents;
          }
          break;
        }
        case "progressive-fixed-price": {
          const tiers = bundleConfig.progressive_tiers || [];
          const totalPriceCents = originalPriceCents;
          
          const matchingTiers = tiers.filter((t) => t?.minimum * 100 <= totalPriceCents);
          const matchingTier = matchingTiers.reduce((highest, current) => 
            (!highest || current?.minimum > highest?.minimum) ? current : highest, 
            null
          );

          if (matchingTier?.discount) {
            const discountCents = Math.round(matchingTier.discount * 100);
            discountedPriceCents = Math.max(0, originalPriceCents - discountCents);
          } else {
            discountedPriceCents = originalPriceCents;
          }
          break;
        }
        default:
          discountedPriceCents = originalPriceCents;
      }

      // Calculate savings
      const savingsAmountCents = originalPriceCents - discountedPriceCents;
      const savingsPercentage =
        originalPriceCents > 0
          ? Math.round((savingsAmountCents / originalPriceCents) * 100)
          : 0;

      return {
        original: toDollars(originalPriceCents),
        discounted: toDollars(discountedPriceCents),
        savingsAmount: toDollars(savingsAmountCents),
        savingsPercentage,
      };
    },

    // Initialize with default variants
    initialize() {
      if (bundleConfig && bundleConfig.components) {
        bundleConfig.components.forEach((component) => {
          const product = bundleProducts[component.product_id] || {};
          const variants = getVariants(component.product_id);
          if (variants.length > 0) {
            const sourceVariant = variants.find((v) => v.available) || variants[0];
            
            // Create a new variant object to avoid sharing references
            const firstAvailable = { ...sourceVariant };
            firstAvailable.quantity = parseInt(component.quantity) || 1;
            firstAvailable.product_id = component.product_id;

            if (bundleConfig?.bundle_type !== "dynamic") {
              this.setVariant(component.component_id, firstAvailable, firstAvailable.quantity);
            }
          }
        });
      }
    },
  };

  // Update the bundle summary items
  function updateBundleSummary() {
    // Cache DOM elements
    const elements = {
      container: node.querySelector("[js-flex-bundles-summary-items]"),
      subtotalRow: node.querySelector("[js-flex-bundles-summary-subtotal-row]"),
      subtotal: node.querySelector("[js-flex-bundles-summary-subtotal]"),
      discountRow: node.querySelector("[js-flex-bundles-summary-discount-row]"),
      discountLabel: node.querySelector("[js-flex-bundles-discount-label]"),
      discount: node.querySelector("[js-flex-bundles-summary-discount]"),
      total: node.querySelector("[js-flex-bundles-summary-total]")
    };

    if (!elements.container) return;

    // Clear existing content
    elements.container.innerHTML = "";
    elements.container.dataset.empty = Object.keys(bundleState.selectedVariants).length === 0 ? "true" : "false";

    // Get selected variants from state
    const selectedVariants = bundleState.selectedVariants;
    if (!Object.keys(selectedVariants).length) return;

    // Build summary items HTML
    let summaryEntries = Object.entries(bundleState.selectedVariants);
    
    // Only sort by price for percentage-by-position discount type
    if (bundleConfig.discount_config.type === "percentage-by-position" || bundleConfig.discount_config.type === "fixed-by-position") {
      summaryEntries = summaryEntries
        .map(([componentId, variant]) => ({
          componentId,
          variant,
          price: variant?.price || 0
        }))
        .sort((a, b) => b.price - a.price)
        .map(({componentId, variant}) => [componentId, variant]);
    }

    const summaryItems = summaryEntries
      .map(([componentId, variant]) => {
        if (!variant) return null; 

        // Get product ID from variant or component ID
        const productId = variant.product_id || componentId.split('_')[0];
        // Get product data
        const productData = bundleProducts[productId] || {};
        // Get the product title from product data, variant name, or fallback
        const productTitle = productData.title || variant.name?.split(' - ')[0] || "Product";
        const quantity = variant.quantity || 1;
        const discount = variant.discount || 0;

        // Get variant info
        const variantInfo = variant.public_title === "Default Title" ? "" : variant.public_title;

        // Calculate prices
        const originalItemPrice = variant.price * quantity;
        let discountedItemPrice = originalItemPrice;
        let discountDisplay = "";

        if ((bundleConfig.discount_config.type === "percentage-by-product" || 
             bundleConfig.discount_config.type === "percentage-by-position") && 
            discount > 0) {
          const discountMultiplier = 1 - discount / 100;
          discountedItemPrice = originalItemPrice * discountMultiplier;
          discountDisplay = `${discount}% off`;
        } else if ((bundleConfig.discount_config.type === "fixed-by-product" || 
                   bundleConfig.discount_config.type === "fixed-by-position") && 
                  discount > 0) {
          const discountCents = Math.round(discount * 100) * quantity;
          discountedItemPrice = Math.max(0, originalItemPrice - discountCents);
          discountDisplay = `$${discount.toFixed(2)} off`;
        }

        // Build item HTML
        return `
          <div class="flex-bundles__summary-item">
            <div class="flex-bundles__summary-item-title">
              ${productTitle} × ${quantity}
              ${variantInfo ? `<div class="flex-bundles__summary-item-variant">${variantInfo}</div>` : ""}
              ${discount > 0 ? `<div class="flex-bundles__summary-item-discount">${discountDisplay}</div>` : ""}
            </div>
            <div class="flex-bundles__summary-item-price">
              ${discountedItemPrice !== originalItemPrice ? `<s class="flex-bundles__summary-item-original-price">${formatMoney(originalItemPrice / 100)}</s>` : ""}
              ${formatMoney(discountedItemPrice / 100)}
            </div>
          </div>
        `;
      })
      .filter(Boolean)
      .join("");

    // Update summary items
    elements.container.innerHTML = summaryItems;

    // Get price calculations
    const prices = bundleState.calculatePrices();

    // Update subtotal
    if (elements.subtotal) {
      elements.subtotal.textContent = formatMoney(prices.original);
    }

    // Handle discount display
    const isByProduct = bundleConfig?.discount_config?.type === "percentage-by-product" || 
                       bundleConfig?.discount_config?.type === "fixed-by-product";
    const hasDiscount = parseFloat(prices.savingsAmount) > 0;

    // Update subtotal row visibility
    if (elements.subtotalRow) {
      elements.subtotalRow.style.display = bundleConfig.discount_config.type === "no-discount" ? "none" : "flex";
    }

    // Update discount row
    if (elements.discountRow) {
      if (hasDiscount) {
        elements.discountRow.style.display = "flex";
        
        if (elements.discountLabel) {
          if (isByProduct) {
            elements.discountLabel.textContent = "Total Savings";
          } else {
            const { type, value } = bundleConfig.discount_config;
            
            if (type === "progressive-percentage-quantity") {
              const totalQuantity = Object.values(bundleState.selectedVariants).reduce(
                (total, variant) => total + (variant?.quantity || 0), 0
              );
              
              const matchingTiers = (bundleConfig.progressive_tiers || []).filter((t) => t?.minimum <= totalQuantity);
              const matchingTier = matchingTiers.reduce((highest, current) => 
                (!highest || current?.minimum > highest?.minimum) ? current : highest, 
                null
              );

              elements.discountLabel.textContent = matchingTier?.discount 
                ? `Discount (${matchingTier.discount}%)`
                : "Discount";
            } else if (type === "progressive-percentage-price") {
              const totalPriceCents = parseFloat(prices.original) * 100;
              
              const matchingTiers = (bundleConfig.progressive_tiers || []).filter((t) => t?.minimum * 100 <= totalPriceCents);
              const matchingTier = matchingTiers.reduce((highest, current) => 
                (!highest || current?.minimum > highest?.minimum) ? current : highest, 
                null
              );

              elements.discountLabel.textContent = matchingTier?.discount 
                ? `Discount (${matchingTier.discount}%)`
                : "Discount";
            } else if (type === "percentage" || type === "progressive-percentage-price") {
              elements.discountLabel.textContent = `Discount (${value}%)`;
            } else {
              elements.discountLabel.textContent = "Discount";
            }
          }
        }

        if (elements.discount) {
          elements.discount.textContent = `-${formatMoney(prices.savingsAmount)}`;
        }
      } else {
        elements.discountRow.style.display = "none";
      }
    }

    // Update total
    if (elements.total) {
      elements.total.textContent = formatMoney(prices.discounted);
    }
  }

  // Update all price displays on the page
  function updatePriceDisplays() {
    const prices = bundleState.calculatePrices();

    // Update original price elements
    node.querySelectorAll("[js-flex-bundles-original-price]").forEach((el) => {
      if (bundleConfig.discount_config.type === "no-discount") {
        el.style.display = "none";
      } else {
        el.style.display = "inline";
        el.textContent = formatMoney(prices.original);
      }
    });

    // Update discounted price elements
    node
      .querySelectorAll("[js-flex-bundles-discounted-price]")
      .forEach((el) => {
        el.textContent = formatMoney(prices.discounted);
      });

    // Update savings percentage elements
    node.querySelectorAll("[js-flex-bundles-savings]").forEach((el) => {
      if (bundleConfig.discount_config.type === "percentage") {
        el.textContent = `Save ${prices.savingsPercentage}%`;
      } else if (bundleConfig.discount_config.type === "fixed") {
        el.textContent = `Save ${formatMoney(prices.savingsAmount)}`;
      } else {
        el.textContent = "";
      }
    });

    // Update the bundle summary
    updateBundleSummary();
  }

  const FlexBundlesProduct = `flex-bundles-product`;
  const FlexBundlesVariantSelects = `flex-bundles-variant-selects`;
  const FlexBundlesForm = `flex-bundles-form`;

  // manages the overall product state and ui
  if (!customElements.get(FlexBundlesProduct)) {
    customElements.define(
      FlexBundlesProduct,
      class extends HTMLElement {
        constructor() {
          super();
          // Store product and component IDs for state management
          this.productId = this.dataset.productId;
          this.componentId = this.dataset.componentId;
          
          // Get product data and variants
          this.productData = bundleProducts[this.productId] || {};
          this.variantData = getVariants(this.productId);
          
          // Cache DOM elements for better performance
          this.variantSelects = this.querySelector(FlexBundlesVariantSelects);
          this.priceElement = this.querySelector("[js-flex-bundles-product-price-discounted]");
          this.priceOriginalElement = this.querySelector("[js-flex-bundles-product-price-original]");
          this.productImage = this.querySelector("[js-flex-bundles-product-image] img");
          this.bundleToggle = this.querySelector("[js-flex-bundles-component-bundle-toggle]");
          this.quantityInput = this.querySelector(`input[name="flex-bundles-component-quantity[${this.productId}]"]`);
          
          // Cache form elements for dynamic bundle validation
          this.form = this.closest(FlexBundlesForm);
          this.requirementsElement = this.form?.querySelector("[js-flex-bundles-requirements]");
          this.submitButton = this.form?.querySelector("[js-flex-bundles-add-to-cart]");
          
          // Cache the quantity input in bundleState
          if (this.quantityInput) {
            bundleState.cacheQuantityInput(this.componentId, this.quantityInput);
          }

          // Get initial quantity and discount from bundle config
          const { quantity, discount } = this.getComponentConfig();
          
          // Initialize with the first variant if available
          if (this.variantData?.length > 0) {
            const firstVariant = this.variantData.find(v => v.available) || this.variantData[0];
            // Set initial quantity and discount
            firstVariant.quantity = quantity;
            firstVariant.discount = discount;
            // Store product_id in the variant for easier reference
            firstVariant.product_id = this.productId;

            // Update price display with initial values
            if (this.priceElement && firstVariant.price) {
              this.updatePriceDisplay(firstVariant, discount);
            }

            // Update bundle state if component is initially selected
            if (this.bundleToggle?.checked) {
              const quantity = this.quantityInput ? parseInt(this.quantityInput.value, 10) : 1;
              bundleState.setVariant(this.componentId, firstVariant, quantity);
              updatePriceDisplays();

              // Dispatch product updated event
              this.dispatchEvent(new CustomEvent(FlexBundles.EVENTS.BUNDLE_COMPONENT_UPDATED));
            }
          }

          // Add a flag to track if we're handling a toggle change
          this.isHandlingToggle = false;

          // Bind methods
          this.onVariantChanged = this.onVariantChanged.bind(this);
        }

        getComponentConfig() {
          if (!bundleConfig?.components) return { quantity: 1, discount: 0 };
          const component = bundleConfig.components.find(c => c.component_id === this.componentId);
          return {
            quantity: bundleConfig.bundle_type === 'dynamic' ? 1 : (component?.quantity || 1),
            discount: component?.discount || 0
          };
        }

        connectedCallback() {
          // Listen for variant changes
          this.addEventListener(FlexBundles.EVENTS.VARIANT_CHANGED, this.onVariantChanged);

          // Listen for quantity changes
          if (this.quantityInput) {
            this.quantityInput.addEventListener("change", this.onQuantityChanged);
          }

          // Listen for bundle toggle changes
          if (this.bundleToggle) {
            this.bundleToggle.addEventListener("change", this.onBundleToggleChanged);
          }
        }

        disconnectedCallback() {
          // Remove event listeners
          this.removeEventListener(FlexBundles.EVENTS.VARIANT_CHANGED, this.onVariantChanged);
          if (this.quantityInput) {
            this.quantityInput.removeEventListener("change", this.onQuantityChanged);
          }
          if (this.bundleToggle) {
            this.bundleToggle.removeEventListener("change", this.onBundleToggleChanged);
          }
        }

        onVariantChanged(event) {
          const variant = event.detail.variant;
          if (!variant) return;

          // Add product_id to variant for easier reference
          variant.product_id = this.productId;

          // Update price display
          if (this.priceElement) {
            const { discount } = this.getComponentConfig();
            this.updatePriceDisplay(variant, discount);
          }

          // Update product image if available
          if (this.productImage && variant.featured_image) {
            this.productImage.src = variant.featured_image.src;
            if (this.productImage.srcset) {
              const currentSrcset = this.productImage.srcset;
              const baseImageUrl = variant.featured_image.src.split('?')[0];
              const newSrcset = currentSrcset.replace(/([^?]*)\?[^ ]*/g, `${baseImageUrl}?`);
              this.productImage.srcset = newSrcset;
            }
          } else if (this.productImage) {
            // Try to get product image from product data if variant doesn't have one
            if (this.productData.featured_image) {
              this.productImage.src = this.productData.featured_image.src;
            }
          }

          // Only update bundle state if component is selected
          if (this.bundleToggle?.checked) {
            const quantity = this.quantityInput ? parseInt(this.quantityInput.value, 10) : 1;
            bundleState.setVariant(this.componentId, variant, quantity);
            updatePriceDisplays();
          }

          event.stopPropagation();
        }

        onQuantityChanged = (event) => {
          if (bundleConfig.bundle_type !== 'dynamic' && !bundleConfig.advanced_settings.allow_quantity_adjustments) return;
          
          const quantity = parseInt(event.target.value);
          if (isNaN(quantity) || quantity < 1) return;

          const variant = bundleState.selectedVariants[this.componentId];
          if (variant && this.bundleToggle?.checked) {
            bundleState.setVariant(this.componentId, variant, quantity);
            updatePriceDisplays();
          }
        };

        onBundleToggleChanged = (event) => {
          const isChecked = event.target.checked;
          const variant = this.variantSelects?.getSelectedVariant();

          // Single path for updating bundle state
          if (isChecked && variant) {
            // Make sure product_id is set
            variant.product_id = this.productId;
            
            // Get quantity from input if available and quantity adjustments are enabled
            let quantity = 1;
            if (this.quantityInput && (bundleConfig.bundle_type === 'dynamic' || bundleConfig.advanced_settings.allow_quantity_adjustments)) {
              quantity = parseInt(this.quantityInput.value, 10) || 1;
            } else if (bundleConfig.bundle_type !== 'dynamic') {
              // For fixed bundles without quantity adjustments, get quantity from config
              const component = bundleConfig.components.find(c => c.component_id === this.componentId);
              quantity = component?.quantity ? parseInt(component.quantity) : 1;
            }
            
            bundleState.setVariant(this.componentId, variant, quantity);
          } else {
            delete bundleState.selectedVariants[this.componentId];
          }

          // Single update call that handles everything
          updatePriceDisplays(); // This already calls updateBundleSummary internally

          // Dispatch product updated event
          const productUpdatedEvent = new CustomEvent(FlexBundles.EVENTS.BUNDLE_COMPONENT_UPDATED, {
            bubbles: true,
            composed: true
          });
          this.dispatchEvent(productUpdatedEvent);
        };

        updatePriceDisplay(variant, discount = 0) {
          if (!variant?.price) return;

          // Update the main price with discount applied
          if (this.priceElement) {
            if (bundleConfig.discount_config.type === "percentage-by-product") {
              // For percentage discounts, convert price to cents, apply percentage, then back to dollars
              const priceInCents = variant.price;
              const discountedPriceInCents = Math.round(priceInCents * (1 - discount / 100));
              this.priceElement.textContent = formatMoney(discountedPriceInCents / 100);
            } else if (bundleConfig.discount_config.type === "fixed-by-product") {
              // For fixed discounts, subtract the exact discount amount
              const priceInCents = variant.price;
              const discountInCents = Math.round(discount * 100); // Convert dollars to cents
              const discountedPriceInCents = Math.max(0, priceInCents - discountInCents);
              this.priceElement.textContent = formatMoney(discountedPriceInCents / 100);
            } else {
              this.priceElement.textContent = formatMoney(variant.price / 100);
            }
          }

          if (discount > 0) { 
            // Update the compare price with original price
            if (this.priceOriginalElement) {
              this.priceOriginalElement.textContent = formatMoney(variant.price / 100);
            }
          } else {
            if (this.priceOriginalElement) {
              this.priceOriginalElement.textContent = "";
            }
          }
        }
      }
    );
  }

  // handles variant selection ui and availability
  if (!customElements.get(FlexBundlesVariantSelects)) {
    customElements.define(
      FlexBundlesVariantSelects,
      class extends HTMLElement {
        constructor() {
          super();
          this.productId = this.dataset.productId;
          this.componentId = this.dataset.componentId;
          this.variantData = getVariants(this.productId);
          this.optionInputs = this.querySelectorAll("[js-flex-bundles-variant-option]");
          this.bundleToggle = this.querySelector("[js-flex-bundles-component-bundle-toggle]");
          this.fieldsets = this.querySelectorAll("[js-flex-bundles-option-fieldset]");
          
          // Cache option positions
          this.optionPositions = [...new Set(
            Array.from(this.optionInputs).map(input => 
              parseInt(input.dataset.optionPosition)
            )
          )];

          // Bind methods once to avoid creating new functions on each event
          this.onToggleChange = this.onToggleChange.bind(this);
          this.onVariantChange = this.onVariantChange.bind(this);
          this.onProductReady = this.onProductReady.bind(this);
        }

        connectedCallback() {
          // Set up event listeners
          if (this.bundleToggle && bundleConfig?.bundle_type === "dynamic") {
            this.bundleToggle.addEventListener("change", this.onToggleChange);
          }
          this.addEventListener("change", this.onVariantChange);
          this.addEventListener('product:ready', this.onProductReady);

          // Add keyboard navigation
          this.addEventListener('keydown', this.handleKeyNavigation);

          // Initialize with first available variant
          this.initializeWithFirstVariant();
        }

        disconnectedCallback() {
          // Clean up event listeners
          if (this.bundleToggle) {
            this.bundleToggle.removeEventListener("change", this.onToggleChange);
          }
          this.removeEventListener("change", this.onVariantChange);
          this.removeEventListener('product:ready', this.onProductReady);
          this.removeEventListener('keydown', this.handleKeyNavigation);
        }

        onProductReady(event) {
          // Update variant data if provided
          if (event.detail.variantData) {
            this.variantData = event.detail.variantData;
            this.initializeWithFirstVariant();
          }
        }

        initializeWithFirstVariant() {
          const firstVariant = this.variantData.find(v => v.available) || this.variantData[0];
          if (firstVariant) {
            this.initializeWithVariant(firstVariant);
          }
        }

        /**
         * Initializes the component with a specific variant
         * @param {Object} variant - The variant to initialize with
         */
        initializeWithVariant(variant) {
          if (!variant) return;
          
          // Set initial options
          const options = variant.options;
          this.optionInputs.forEach(input => {
            const position = parseInt(input.dataset.optionPosition) - 1;
            if (options[position] === input.value) {
              input.checked = true;
            }
          });

          // Update option legends
          this.updateOptionLegends(options);
          // Update option availability
          this.updateOptionsAvailability();
        }

        /**
         * Handles changes to the bundle toggle (for dynamic bundles)
         * @param {Event} event - The change event from the toggle
         */
        onToggleChange(event) {
          const isChecked = event.target.checked;
          const variant = this.getSelectedVariant();
          
          if (!isChecked || !variant) {
            delete bundleState.selectedVariants[this.componentId];
            updatePriceDisplays();
            return;
          }

          // Set product_id for easier reference
          variant.product_id = this.productId;
          
          // Get current quantity and discount
          let quantity = 1;
          if (bundleConfig.bundle_type === 'dynamic') {
            const quantityInput = bundleState.quantityInputs[this.componentId];
            quantity = quantityInput ? parseInt(quantityInput.value, 10) : 1;
          }
          
          let discount = 0;
          if (bundleConfig?.components) {
            const component = bundleConfig.components.find(c => c.component_id === this.componentId);
            if (component && (bundleConfig.discount_config.type === "percentage-by-product" || 
                            bundleConfig.discount_config.type === "fixed-by-product")) {
              discount = component.discount || 0;
            }
          }

          // Update variant with quantity and discount
          if (discount > 0) variant.discount = discount;
          
          // Update bundle state and notify parent
          bundleState.setVariant(this.componentId, variant, quantity);
          this.dispatchVariantChanged(variant);
        }

        /**
         * Handles changes to variant options
         */
        onVariantChange() {
          const variant = this.getSelectedVariant();
          if (!variant) return;

          // Update UI and state
          this.updateOptionLegends(variant.options);
          this.updateOptionsAvailability();
          
          // Notify parent of change
          this.dispatchVariantChanged(variant);
        }

        /**
         * Gets the currently selected variant
         * @returns {Object|null} The selected variant or null
         */
        getSelectedVariant() {
          const selectedOptions = this.getSelectedOptions();
          return this.variantData.find(variant => 
            variant.available && 
            selectedOptions.every((option, index) => option === variant.options[index])
          );
        }

        /**
         * Gets the currently selected options
         * @returns {Array<string>} Array of selected option values
         */
        getSelectedOptions() {
          return Array.from(this.optionInputs)
            .filter(input => input.checked)
            .map(input => ({
              position: parseInt(input.dataset.optionPosition) - 1,
              value: input.value
            }))
            .sort((a, b) => a.position - b.position)
            .map(option => option.value);
        }

        /**
         * Updates which options are available based on current selection
         */
        updateOptionsAvailability() {
          const selectedOptions = this.getSelectedOptions();

          this.optionPositions.forEach(position => {
            const testOptions = [...selectedOptions];
            const optionInputsForPosition = Array.from(this.optionInputs)
              .filter(input => parseInt(input.dataset.optionPosition) === position);

            optionInputsForPosition.forEach(input => {
              testOptions[position - 1] = input.value;
              const isAvailable = this.variantData.some(variant => 
                variant.available && 
                testOptions.every((option, index) => 
                  option === undefined || option === variant.options[index]
                )
              );

              const label = input.nextElementSibling;
              input.disabled = !isAvailable;
              input.classList.toggle("disabled", !isAvailable);
              label?.classList.toggle("disabled", !isAvailable);

              // Add accessibility attributes
              input.setAttribute('aria-disabled', !isAvailable);
              if (!isAvailable) {
                input.setAttribute('aria-label', `${input.value} - Not available`);
              } else {
                input.removeAttribute('aria-label');
              }
            });
          });
        }

        /**
         * Updates the option legends with selected values
         * @param {Array<string>} selectedOptions - Array of selected option values
         */
        updateOptionLegends(selectedOptions) {
          this.fieldsets.forEach((fieldset, index) => {
            const optionValue = fieldset.querySelector("[js-flex-bundles-variant-option-value]");
            if (optionValue && selectedOptions[index]) {
              optionValue.textContent = selectedOptions[index];
            }
          });
        }

        /**
         * Dispatches a variant changed event
         * @param {Object} variant - The variant that changed
         */
        dispatchVariantChanged(variant) {
          this.dispatchEvent(new CustomEvent(FlexBundles.EVENTS.VARIANT_CHANGED, {
            bubbles: true,
            detail: { variant }
          }));
        }

        handleKeyNavigation(event) {
          const { key } = event;
          const currentInput = document.activeElement;
          
          if (!currentInput.matches('[js-flex-bundles-variant-option]')) return;

          const currentPosition = parseInt(currentInput.dataset.optionPosition);
          const currentOptions = Array.from(this.optionInputs)
            .filter(input => parseInt(input.dataset.optionPosition) === currentPosition);

          const currentIndex = currentOptions.indexOf(currentInput);

          switch (key) {
            case 'ArrowLeft':
              event.preventDefault();
              if (currentIndex > 0) {
                currentOptions[currentIndex - 1].focus();
              }
              break;
            case 'ArrowRight':
              event.preventDefault();
              if (currentIndex < currentOptions.length - 1) {
                currentOptions[currentIndex + 1].focus();
              }
              break;
            case 'ArrowUp':
              event.preventDefault();
              const prevPosition = currentPosition - 1;
              if (prevPosition > 0) {
                const prevOptions = Array.from(this.optionInputs)
                  .filter(input => parseInt(input.dataset.optionPosition) === prevPosition);
                if (prevOptions.length) {
                  prevOptions[0].focus();
                }
              }
              break;
            case 'ArrowDown':
              event.preventDefault();
              const nextPosition = currentPosition + 1;
              const nextOptions = Array.from(this.optionInputs)
                .filter(input => parseInt(input.dataset.optionPosition) === nextPosition);
              if (nextOptions.length) {
                nextOptions[0].focus();
              }
              break;
          }
        }
      }
    );
  }

  if (!customElements.get(FlexBundlesForm)) {
    customElements.define(
      FlexBundlesForm,
      class extends HTMLElement {
        constructor() {
          super();
          this.form = this.querySelector("form");
          this.submitButton = this.querySelector("[js-flex-bundles-add-to-cart]");
          this.originalButtonText = this.submitButton?.querySelector("span")?.textContent || "Add to Cart";
          this.blockId = this.dataset.blockId;
          this.requirementsElement = this.querySelector("[js-flex-bundles-requirements]");

          // Only needed for fixed bundles
          this.isFixed = bundleConfig?.bundle_type !== "dynamic";
          if (this.isFixed) {
            this.bundleProducts = Array.from(this.querySelectorAll("[js-flex-bundles-product]"));
          }

          // Bind methods once
          this.handleSubmit = this.handleSubmit.bind(this);
          this.checkAllProductsAvailability = this.checkAllProductsAvailability.bind(this);
          this.onProductUpdated = this.onProductUpdated.bind(this);
          this.validateDynamicBundleRequirements = this.validateDynamicBundleRequirements.bind(this);
        }

        connectedCallback() {
          // Set up event listeners
          if (this.form) {
            this.form.addEventListener("submit", this.handleSubmit, { capture: true });
          }

          this.addEventListener(FlexBundles.EVENTS.BUNDLE_COMPONENT_UPDATED, this.onProductUpdated);

          if (this.isFixed) {
            this.checkAllProductsAvailability();
          }
        }

        disconnectedCallback() {
          // Clean up event listeners
          if (this.form) {
            this.form.removeEventListener("submit", this.handleSubmit, { capture: true });
          }
          this.removeEventListener(FlexBundles.EVENTS.BUNDLE_COMPONENT_UPDATED, this.onProductUpdated);
        }

        /**
         * Handles product update events
         * @param {Event} event - The product updated event
         */
        onProductUpdated(event) {
          updatePriceDisplays();
          this.checkAllProductsAvailability();
          this.validateDynamicBundleRequirements();
        }

        /**
         * Validates the bundle state
         * @returns {Object} Validation result with isValid and error message
         */
        validateBundleState() {
          const selectedVariants = bundleState.selectedVariants;
          
          if (!Object.keys(selectedVariants).length) {
            return { isValid: false, error: "No products selected" };
          }

          // Validate all selected variants
          for (const [componentId, variant] of Object.entries(selectedVariants)) {
            if (!variant) {
              return { isValid: false, error: `Missing variant for component ${componentId}` };
            }

            if (!variant.available) {
              return { isValid: false, error: `Selected variant for component ${componentId} is not available` };
            }

            if (bundleConfig?.bundle_type === 'dynamic' && (!variant.quantity || variant.quantity < 1)) {
              return { isValid: false, error: `Invalid quantity for component ${componentId}` };
            }
          }

          return { isValid: true };
        }

        /**
         * Handles form submission
         * @param {Event} event - The submit event
         */
        handleSubmit(event) {
          event.preventDefault();
          if (this.submitButton.disabled) return;

          // Update button state
          updateButtonState(this.submitButton, {
            text: "Adding...",
            loading: true,
            disabled: true,
          });

          const validation = this.validateBundleState();

          if (!validation.isValid) {
            console.error("Bundle validation failed:", validation.error);
            updateButtonState(this.submitButton, {
              text: validation.error,
              loading: false,
              disabled: true,
            });
            return;
          }

          try {
            // Get selected variants from bundleState
            const selectedVariants = Object.entries(bundleState.selectedVariants).map(([componentId, variant]) => {
              const productId = variant.product_id;
              const productData = bundleProducts[productId] || {};
              
              return {
                id: variant.id,
                quantity: variant.quantity || 1,
                variantData: variant,
                productData: productData
              };
            });

            // Prepare cart properties
            const properties = {
              _components: selectedVariants.map((variant) => {
                const componentItem = { 
                  id: parseInt(variant.id),
                };
                
                if (bundleConfig.bundle_type === 'dynamic' || bundleConfig.advanced_settings.allow_quantity_adjustments) {
                  componentItem.quantity = parseInt(variant.quantity);
                }
                
                if (bundleConfig?.advanced_settings?.disable_backend_validation) {
                  componentItem.price = variant.variantData.price / 100;
                  componentItem.quantity = variant.quantity;
                  componentItem.discount = variant.variantData.discount || 0;
                }
                
                return componentItem;
              }),
            };

            // Add line item properties if configured
            if (bundleConfig?.line_item_properties) {
              const prices = bundleState.calculatePrices();
              bundleConfig.line_item_properties.forEach((prop) => {

                const hasNoSavings = (prop.value.includes("$EXACT_SAVINGS") && prices.savingsAmount <= 0) || (prop.value.includes("$PERCENT_SAVINGS") && prices.savingsPercentage <= 0)
                  
                if (!hasNoSavings) {
                  properties[prop.key] = prop.value
                  .replace(/\$ORIGINAL_PRICE/g, formatMoney(prices.original))
                  .replace(/\$DISCOUNTED_PRICE/g, formatMoney(prices.discounted))
                  .replace(/\$EXACT_SAVINGS/g, formatMoney(prices.savingsAmount))
                  .replace(/\$PERCENT_SAVINGS/g, `${prices.savingsPercentage}%`);
                }
                
              });
            }

            // Add component line item properties if configured
            if (bundleConfig.advanced_settings?.display_bundle_components_as_line_item_properties) {
              const replacePlaceholders = (template, variant, index) => {
                if (!template) return '';
                return template
                  .replace('$INDEX', index + 1)
                  .replace('$PRODUCT_TITLE', variant.productData?.title || '')
                  .replace('$VARIANT_TITLE', variant.variantData?.title || 'Default Title')
                  .replace('$QUANTITY', variant.quantity || 1);
              };

              selectedVariants.forEach((variant, index) => {
                const propertyKey = replacePlaceholders(
                  bundleConfig.advanced_settings?.line_item_property_key,
                  variant,
                  index
                );
                const propertyValue = replacePlaceholders(
                  bundleConfig.advanced_settings?.line_item_property_value,
                  variant,
                  index
                );

                if (propertyKey && propertyValue) {
                  properties[propertyKey] = propertyValue;
                }
              });
            }

            // Submit to cart
            handleAddToCart(
              {
                items: [
                  {
                    id: bundleConfig.parent.variant_id,
                    quantity: 1,
                    properties,
                  },
                ],
              },
              {
                onSuccess: (data) => {
                  updateButtonState(this.submitButton, {
                    text: "Added!",
                    loading: false,
                    disabled: false,
                  });

                  document.dispatchEvent(
                    new CustomEvent(FlexBundles.EVENTS.AFTER_ADD_TO_CART, {
                      detail: { cartData: data },
                    }),
                  );

                  // Reset button after delay
                  setTimeout(() => {
                    updateButtonState(this.submitButton, {
                      text: this.originalButtonText,
                      loading: false,
                      disabled: false,
                    });
                  }, 2000);
                },
                onError: (errorText) => {
                  updateButtonState(this.submitButton, {
                    text: errorText,
                    loading: false,
                    disabled: false,
                  });
                },
              },
            );
          } catch (error) {
            console.error("Error submitting form:", error);
            updateButtonState(this.submitButton, {
              text: "Error - Try Again",
              loading: false,
              disabled: false,
            });
          }
        }

        /**
         * Checks if all products in a fixed bundle are available
         * @returns {boolean} Whether all products are available
         */
        checkAllProductsAvailability() {
          if (!this.isFixed) return true;

          let allAvailable = true;
          this.bundleProducts.forEach((product) => {
            const variant = bundleState.getVariant(product.dataset.componentId);
            if (variant && !variant.available) {
              allAvailable = false;
            }
          });

          updateButtonState(this.submitButton, {
            text: this.originalButtonText,
            loading: !allAvailable,
            disabled: !allAvailable,
          });

          return allAvailable;
        }

        /**
         * Validates dynamic bundle requirements
         * @returns {boolean} Whether the bundle requirements are met
         */
        validateDynamicBundleRequirements() {
          if (bundleConfig?.bundle_type !== 'dynamic' || !this.requirementsElement || !this.submitButton) {
            return true;
          }

          let isValid = true;

          // Check each step's requirements
          for (const step of bundleConfig.steps) {
            if (step.required_products?.enabled) {
              const requiredCount = step.required_products.count || 0;
              const collectionId = step.collection_id;
              
              // Count products that belong to this collection
              const selectedCount = Object.values(bundleState.selectedVariants).filter(variant => {
                const productId = variant.product_id;
                return collectionProducts[collectionId]?.[productId] === true;
              }).length;

              if (selectedCount < requiredCount) {
                isValid = false;
                break;
              }
            }
          }

          // Update UI based on validation
          this.requirementsElement.style.display = isValid ? "none" : "block";
          this.submitButton.disabled = !isValid;

          return isValid;
        }
      }
    );
  }

  // Add these helper functions near the top with other helpers
  function handleAddToCart(body, callbacks) {
    fetch("/cart/add.js", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
      },
      body: JSON.stringify(body),
    })
      .then((response) => {
        if (!response.ok)
          throw new Error(`HTTP error! Status: ${response.status}`);
        return response.json();
      })
      .then((data) => {
        if (data.status) {
          console.error("Error adding products to cart:", data.description);
          callbacks.onError("Error - Try Again");
        } else {
          callbacks.onSuccess(data);
        }
      })
      .catch((error) => {
        console.error("Error:", error);
        callbacks.onError("Error - Try Again");
      });
  }

  function updateButtonState(button, { text, loading, disabled }) {
    const span = button.querySelector("span");
    if (span) span.textContent = text;

    button.disabled = disabled;
    button.setAttribute("data-loading", loading.toString());
    button.setAttribute("aria-disabled", disabled.toString());
  }


  // Initialize immediately since script is at bottom of template
  bundleState.initialize();
  updatePriceDisplays();
  updateBundleSummary();

  return () => {
    // Remove event listeners if needed
    node.querySelectorAll("[js-flex-bundles-product]").forEach((product) => {
      product.removeEventListener("variant:changed", product.onVariantChanged);
    });
    // Clear state
    bundleState.selectedVariants = {};
  };
};

if (!customElements.get("flex-bundles-quantity-input")) {
  customElements.define(
    "flex-bundles-quantity-input",
    class extends HTMLElement {
      constructor() {
        super();
        this.input = this.querySelector("input");
        this.changeEvent = new Event("change", { bubbles: true });

        // Add event listeners
        this.input.addEventListener("change", this.onInputChange.bind(this));
        this.querySelectorAll("button").forEach((button) =>
          button.addEventListener("click", this.onButtonClick.bind(this)),
        );
      }

      // Handle button clicks (plus/minus)
      onButtonClick(event) {
        event.preventDefault();
        const previousValue = this.input.value;

        event.target.name === "plus"
          ? this.input.stepUp()
          : this.input.stepDown();
        if (previousValue !== this.input.value)
          this.input.dispatchEvent(this.changeEvent);
      }

      // Handle direct input changes
      onInputChange() {
        this.validateQtyRules();
      }

      // Validate quantity rules
      validateQtyRules() {
        const value = parseInt(this.input.value);
        if (this.input.min) {
          const min = parseInt(this.input.min);
          const buttonMinus = this.querySelector(
            "[js-flex-bundles-component-quantity-minus]",
          );
          buttonMinus.disabled = value <= min;
        }
        if (this.input.max) {
          const max = parseInt(this.input.max);
          const buttonPlus = this.querySelector(
            "[js-flex-bundles-component-quantity-plus]",
          );
          buttonPlus.disabled = value >= max;
        }
      }
    },
  );
}
