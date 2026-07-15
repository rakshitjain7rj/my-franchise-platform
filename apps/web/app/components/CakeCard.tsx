"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Star, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import cakeImage from "../assets/dummy.avif";
import { Separator } from "@/components/ui/separator";
import { useEffect, useState } from "react";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious, } from "@/components/ui/pagination";
import { cakes } from "../assets/dummy-data";


export default function CakeCard() {
    const [currentPage, setCurrentPage] = useState(1);

    const cakesPerPage = 24;

    const totalPages = Math.ceil(cakes.length / cakesPerPage);

    const startIndex = (currentPage - 1) * cakesPerPage;

    const currentCakes = cakes.slice(startIndex, startIndex + cakesPerPage);
    return (
        <div >
            <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(180px,1fr))] p-4  md:p-6 lg:p-8  ">

                {currentCakes.map((cake) => (
                    <Card key={cake.id}
                        className="  py-0 my-2 bg-white"
                    >
                        <CardContent className=" p-0 ">

                            <div >
                                <img
                                    src={cakeImage.src}
                                    alt={cake.name}
                                    className="aspect-square w-full  object-cover px-0"
                                />
                            </div>

                            {/* <div className="aspect-square rounded-md bg-muted" /> */}
                            <div className="p-3">
                                <div className="flex items-center justify-between">
                                    <h1 className="text-base md:text-lg font-bold truncate">{cake.name}</h1>
                                    <span className="text-pink-600 text-label-bold text-lg pl-1">{cake.price}</span>
                                </div>


                                <div className="min-h-[3rem]">
                                    <p className="text-sm text-muted-foreground">
                                        {cake.description}
                                    </p>
                                </div>

                                <Separator className="w-full bg-gray-500 h-[0.5px] mt-0 mb-2" />
                                <div className="flex items-center justify-between">

                                    {/* Rating */}
                                    <div className="flex items-center gap-2">
                                        <Star
                                            className="h-5 w-5 fill-yellow-400 text-yellow-400"
                                        />
                                        <span className="font-medium">
                                            {cake.rating}
                                        </span>
                                    </div>

                                    {/* Cart */}
                                    <ShoppingCart
                                        className="h-6 w-6 text-pink-600 cursor-pointer"
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
            <Pagination className="py-6">
                <PaginationContent>

                    <PaginationItem>
                        <PaginationPrevious
                            href="#"
                            onClick={(e) => {
                                e.preventDefault();
                                if (currentPage > 1) {
                                    setCurrentPage(currentPage - 1);
                                }
                            }}
                        />
                    </PaginationItem>

                    {Array.from({ length: totalPages }, (_, index) => (
                        <PaginationItem key={index}>
                            <PaginationLink
                                href="#"
                                isActive={currentPage === index + 1}
                                onClick={(e) => {
                                    e.preventDefault();
                                    setCurrentPage(index + 1);
                                }}
                            >
                                {index + 1}
                            </PaginationLink>
                        </PaginationItem>
                    ))}

                    <PaginationItem>
                        <PaginationNext
                            href="#"
                            onClick={(e) => {
                                e.preventDefault();
                                if (currentPage < totalPages) {
                                    setCurrentPage(currentPage + 1);
                                }
                            }}
                        />
                    </PaginationItem>

                </PaginationContent>
            </Pagination>
        </div>);
}