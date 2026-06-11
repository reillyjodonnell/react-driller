export type Note = {
  id: string;
  title: string;
  body: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
};

export type Theme = "light" | "dark" | "system";
