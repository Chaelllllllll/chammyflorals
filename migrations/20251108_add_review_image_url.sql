-- Migration: add image_url column to reviews
-- Run this in your Supabase SQL editor or psql client
ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS image_url text NULL;

-- Optional: create a storage bucket for review images (run via Supabase UI or CLI)
-- Supabase storage buckets are managed outside SQL; create a bucket named 'reviews' and make files public or configure signed URLs.
