-- Development seed data for the un533n catalogue.
-- Loaded after un533n_v2.sql. Image paths point at the photos already in
-- public/imgs/, which is what product_variants.image_url is for.
--
-- NOTE: the last product is deliberately left with no variants, to exercise
-- the null-variant guard in ProductCard/ProductDetail (a LEFT JOIN +
-- JSON_ARRAYAGG returns one all-null row for such a product, not an empty
-- array).

DELETE FROM cart_items;
DELETE FROM order_items;
DELETE FROM wishlists;
DELETE FROM carts;
DELETE FROM orders;
DELETE FROM product_variants;
DELETE FROM products;

INSERT INTO products (id, name, description, category) VALUES
  (1, 'Oversized Hoodie',   'Heavyweight cotton hoodie with a dropped shoulder and embroidered mark.', 'Outerwear'),
  (2, 'Wide-Leg Trouser',   'Relaxed pleated trouser cut from a matte technical weave.',               'Bottoms'),
  (3, 'Boxy Tee',           'Garment-dyed heavy jersey with a boxy body and ribbed collar.',           'Tops'),
  (4, 'Cropped Jacket',     'Structured cropped jacket with a concealed placket.',                     'Outerwear'),
  (5, 'Knit Beanie',        'Fine-gauge ribbed beanie in a soft merino blend.',                        'Accessories'),
  (6, 'Archive Overshirt',  'Coming soon - not yet available in any size.',                            'Outerwear');

INSERT INTO product_variants (product_id, sku, size, color, price, stock_quantity, image_url) VALUES
  (1, 'UN-HOOD-BLK-S',  'S',  'Black', 129.00, 12, '/imgs/IMG_4404.JPG'),
  (1, 'UN-HOOD-BLK-M',  'M',  'Black', 129.00,  8, '/imgs/IMG_4404.JPG'),
  (1, 'UN-HOOD-BLK-L',  'L',  'Black', 129.00,  0, '/imgs/IMG_4404.JPG'),
  (1, 'UN-HOOD-SND-M',  'M',  'Sand',  129.00,  5, '/imgs/IMG_4405.JPG'),

  (2, 'UN-TRSR-BLK-30', '30', 'Black',  98.50, 10, '/imgs/IMG_4407.JPG'),
  (2, 'UN-TRSR-BLK-32', '32', 'Black',  98.50,  7, '/imgs/IMG_4407.JPG'),
  (2, 'UN-TRSR-SLT-32', '32', 'Slate',  98.50,  3, '/imgs/IMG_4408.JPG'),

  (3, 'UN-TEE-WHT-S',   'S',  'White',  45.00, 20, '/imgs/IMG_4411.JPG'),
  (3, 'UN-TEE-WHT-M',   'M',  'White',  45.00, 18, '/imgs/IMG_4411.JPG'),
  (3, 'UN-TEE-BLK-M',   'M',  'Black',  45.00, 15, '/imgs/IMG_4414.JPG'),
  (3, 'UN-TEE-BLK-L',   'L',  'Black',  45.00,  9, '/imgs/IMG_4414.JPG'),

  (4, 'UN-JKT-BLK-M',   'M',  'Black', 245.00,  4, '/imgs/IMG_4421.JPG'),
  (4, 'UN-JKT-BLK-L',   'L',  'Black', 245.00,  2, '/imgs/IMG_4421.JPG'),
  (4, 'UN-JKT-BRN-M',   'M',  'Brown', 245.00,  6, '/imgs/IMG_4422.JPG'),

  (5, 'UN-BEAN-BLK-OS', 'OS', 'Black',  38.00, 25, '/imgs/IMG_4434.JPG'),
  (5, 'UN-BEAN-GLD-OS', 'OS', 'Gold',   38.00, 11, '/imgs/IMG_9696.PNG');

-- Admin access is deliberately NOT granted here: product writes and order
-- status changes require users.is_admin, and a seed file should never mint
-- an admin. Grant it by hand for a local account:
--
--   UPDATE users SET is_admin = TRUE WHERE email = 'you@example.com';
