// components/Logo.tsx (or wherever you use the logo)
import Image from 'next/image'

export default function Logo() {
  return (
    <Image 
      src="/klo2.png"
      alt="Company Logo"
      width={150}  // Change to your logo width
      height={50}  // Change to your logo height
      loading="eager"  // Fix LCP warning
      quality={100}  // High quality for logo
    />
  )
}
