export { cn } from "./cn";

// Primitives (Showcase-themed; see ADR-0001)
export { Button, buttonVariants } from "./components/button";
export { Input, Textarea, Label } from "./components/input";
export { Badge, badgeVariants } from "./components/badge";
export { Card, CardFloating, CardHeader, CardTitle, CardContent, CardFooter } from "./components/card";
export {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./components/dialog";
export { Select, SelectGroup, SelectValue, SelectTrigger, SelectContent, SelectItem } from "./components/select";
export { Tabs, TabsList, TabsTrigger, TabsContent } from "./components/tabs";
export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "./components/table";
export { Skeleton, Separator } from "./components/skeleton";
export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "./components/tooltip";
export { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "./components/dropdown-menu";
export { Checkbox, Switch } from "./components/checkbox";

// Showcase components (ADR-0001)
export { ColorDots } from "./showcase/color-dots";
export { deriveColorDots, type DotVariant } from "./showcase/color-dots-logic";
export { Price } from "./showcase/price";
export {
  NewBadge,
  SoldOutBadge,
  AnnouncementStrip,
  RankNumeral,
} from "./showcase/showcase";

// Editorial section anchor — shared by every block/section surface
export { SectionHeader } from "./components/section-header";

// Showcase accents (React Bits adaptations — marketing surfaces only, see accents/README.md)
export { FadeWords } from "./accents/fade-words";
export { SlideWords } from "./accents/slide-words";
export { RiseBlock } from "./accents/rise-block";
export { Counter } from "./accents/counter";
export { ShinyText } from "./accents/shiny-text";
export { SpotlightCard } from "./accents/spotlight-card";
export { StarBorder } from "./accents/star-border";
export { ProductGallery } from "./showcase/product-gallery";
export { ColorDotSwatches } from "./showcase/color-dots";
