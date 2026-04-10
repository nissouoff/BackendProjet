-- Create landings table
CREATE TABLE landings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  user_id TEXT NOT NULL,
  is_landing BOOLEAN DEFAULT true,
  content JSONB DEFAULT '{}',
  products JSONB DEFAULT '[]',
  is_published BOOLEAN DEFAULT false,
  views INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create reviews table
CREATE TABLE reviews (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  landing_id UUID REFERENCES landings(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create orders table
CREATE TABLE orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  landing_id UUID REFERENCES landings(id) ON DELETE CASCADE,
  product_id TEXT,
  product_name TEXT,
  quantity INTEGER DEFAULT 1,
  total DECIMAL(10, 2) NOT NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_wilaya TEXT,
  customer_commune TEXT,
  customer_address TEXT,
  shipping_address TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'paid', 'returned', 'deleted')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create landing_views table to track unique views
CREATE TABLE landing_views (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  landing_id UUID REFERENCES landings(id) ON DELETE CASCADE,
  ip_address TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(landing_id, ip_address)
);

-- Create indexes
CREATE INDEX idx_landings_user_id ON landings(user_id);
CREATE INDEX idx_landings_slug ON landings(slug);
CREATE INDEX idx_landings_is_published ON landings(is_published);
CREATE INDEX idx_reviews_landing_id ON reviews(landing_id);
CREATE INDEX idx_orders_landing_id ON orders(landing_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_landing_views_landing_id ON landing_views(landing_id);
CREATE INDEX idx_landing_views_ip ON landing_views(ip_address);

-- Enable Row Level Security (RLS)
ALTER TABLE landings ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE landing_views ENABLE ROW LEVEL SECURITY;

-- Create policies (allow all for now - adjust based on your auth needs)
CREATE POLICY "Allow all" ON landings FOR ALL USING (true);
CREATE POLICY "Allow all" ON reviews FOR ALL USING (true);
CREATE POLICY "Allow all" ON orders FOR ALL USING (true);
CREATE POLICY "Allow all" ON landing_views FOR ALL USING (true);
