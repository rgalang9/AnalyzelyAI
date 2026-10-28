import Image from "next/image";

// Brand logo: the icon from public/logo.png + "analyzely"
export default function Logo() {
  return (
    <span className="flex items-center gap-2">
      <Image src="/logo.png" alt="" width={37} height={32} priority className="h-8 w-auto" />
      <span className="font-display text-2xl font-extrabold tracking-tight text-navy">
        analyzely
      </span>
    </span>
  );
}
