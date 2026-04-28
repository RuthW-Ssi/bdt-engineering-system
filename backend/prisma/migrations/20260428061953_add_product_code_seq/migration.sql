-- CreateTable
CREATE TABLE "product_code_seq" (
    "kind" VARCHAR(10) NOT NULL,
    "next_run" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "product_code_seq_pkey" PRIMARY KEY ("kind")
);
