-- Drop old drawing_revision table (cascades from shop_drawing)
DROP TABLE IF EXISTS "drawing_revision" CASCADE;

-- Drop old shop_drawing table
DROP TABLE IF EXISTS "shop_drawing" CASCADE;

-- Drop FK columns from products
ALTER TABLE "products" DROP COLUMN IF EXISTS "master_drawing_id";
ALTER TABLE "products" DROP COLUMN IF EXISTS "shop_drawing_id";

-- Create new drawing table
CREATE TABLE "drawing" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "file_key" VARCHAR(500) NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(100),
    "uploaded_by_id" INTEGER NOT NULL,
    "create_date" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "drawing_pkey" PRIMARY KEY ("id")
);

-- Add foreign keys
ALTER TABLE "drawing" ADD CONSTRAINT "drawing_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "drawing" ADD CONSTRAINT "drawing_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "res_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
