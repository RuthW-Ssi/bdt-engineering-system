-- AddColumn: background image URL for RoutingBuilder canvas
ALTER TABLE "routing_template" ADD COLUMN IF NOT EXISTS "bg_image_url" VARCHAR(500);
