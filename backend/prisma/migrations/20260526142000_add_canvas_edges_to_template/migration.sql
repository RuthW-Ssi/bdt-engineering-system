-- AddColumn: persist canvas edge layout for RoutingBuilder
ALTER TABLE "routing_template" ADD COLUMN "canvas_edges" JSONB;
