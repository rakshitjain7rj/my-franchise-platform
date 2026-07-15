import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

import {
    Search,
    ShoppingCart,
    User,
    Cake
} from "lucide-react";

export default function Navbar() {
    return (
        <nav className="h-20 border-b bg-white">
            <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-6">

                {/* Left Side */}
                <div className="flex items-center gap-8">

                    {/* Logo */}
                    <div className="flex items-center gap-2">
                        <Cake className="h-5 w-5 text-purple-700" />

                        <span className="text-deep-purple text-lg font-bold leading-tight tracking-[-0.015em]">
                            Cake Break
                        </span>
                    </div>

                    {/* Navigation Links */}
                    <div className="flex items-center gap-6 text-sm">
                        <a href="#">Home</a>
                        <a href="#">Cakes</a>
                        <a href="#">About Us</a>
                        <a href="#">Apply Franchise</a>
                        <a href="#">Contact Us</a>
                    </div>

                </div>

                {/* Right Side */}
                <div className="flex items-center gap-3">

                    {/* Search */}
                    <div className="relative">
                        <Input
                            placeholder="Search cakes..."
                            className="w-64 pl-8"
                        />

                        <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    </div>

                    {/* Cart */}
                    <Button
                        variant="ghost"
                        size="icon"
                    >
                        <ShoppingCart className="h-5 w-5" />
                    </Button>

                    {/* Profile */}
                    <Button
                        variant="ghost"
                        size="icon"
                    >
                        <User className="h-5 w-5" />
                    </Button>

                </div>

            </div>
        </nav>
    );
}