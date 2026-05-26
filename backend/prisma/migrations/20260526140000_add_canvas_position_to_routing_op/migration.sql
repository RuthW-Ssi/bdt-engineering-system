-- AddColumn: canvas position for RoutingBuilder drag-and-drop layout
ALTER TABLE "mrp_routing_workcenter" ADD COLUMN "canvas_x" DOUBLE PRECISION;
ALTER TABLE "mrp_routing_workcenter" ADD COLUMN "canvas_y" DOUBLE PRECISION;
