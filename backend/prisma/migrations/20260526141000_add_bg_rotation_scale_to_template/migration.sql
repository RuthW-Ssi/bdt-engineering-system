-- AddColumns: background rotation and scale for RoutingBuilder canvas
ALTER TABLE "routing_template" ADD COLUMN "bg_rotation" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "routing_template" ADD COLUMN "bg_scale" DOUBLE PRECISION DEFAULT 1;
