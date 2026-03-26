export type BlogTeaser = {
  slug: string;
  title: string;
  excerpt: string;
};

export type BlogListItem = BlogTeaser & {
  created_at: string;
};
