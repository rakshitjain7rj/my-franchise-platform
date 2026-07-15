"use client";
import React from 'react'
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue, } from "@/components/ui/select"

export default function Filters() {
    return (
        <div className="flex justify-between items-start mx-9 ">
            <div>
                <h1 className="text-5xl font-light text-purple-900">
                    Cake Catalog
                </h1>

                <p className="mt-3 text-lg text-gray-600">
                    Discover our handcrafted artisanal treats
                </p>
            </div>
            <div className="w-full xl:w-auto">
                <div className="bg-white border rounded-3xl p-5 shadow-sm w-full">
                    <div className="flex flex-wrap items-center gap-2">

                        {/* Best Sellers */}
                        <Select>
                            <SelectTrigger className="w-full sm:w-[180px] h-14 rounded-xl">
                                <SelectValue placeholder="Best Sellers" />
                            </SelectTrigger>

                            <SelectContent className="bg-white">
                                <SelectItem value="best-sellers">
                                    Best Sellers
                                </SelectItem>

                                <SelectItem value="popular">
                                    Most Popular
                                </SelectItem>

                                <SelectItem value="featured">
                                    Featured
                                </SelectItem>
                            </SelectContent>
                        </Select>

                        {/* Gluten Free */}
                        <Select>
                            <SelectTrigger className="w-full sm:w-[180px] h-14 rounded-xl">
                                <SelectValue placeholder="Gluten-Free" />
                            </SelectTrigger>

                            <SelectContent className="bg-white">
                                <SelectItem value="gluten-free">
                                    Gluten-Free
                                </SelectItem>

                                <SelectItem value="eggless">
                                    Eggless
                                </SelectItem>

                                <SelectItem value="vegan">
                                    Vegan
                                </SelectItem>
                            </SelectContent>
                        </Select>

                        {/* New Arrivals */}
                        <Select>
                            <SelectTrigger className="w-full sm:w-[180px] h-14 rounded-xl">
                                <SelectValue placeholder="New Arrivals" />
                            </SelectTrigger>

                            <SelectContent className="bg-white">
                                <SelectItem value="new">
                                    New Arrivals
                                </SelectItem>

                                <SelectItem value="latest">
                                    Latest
                                </SelectItem>

                                <SelectItem value="seasonal">
                                    Seasonal
                                </SelectItem>
                            </SelectContent>
                        </Select>

                        {/* Divider */}
                        <div className="hidden lg:block h-10 w-px bg-border" />

                        {/* Price Range */}
                        <Select>
                            <SelectTrigger className="w-full sm:w-[180px] h-14 rounded-xl">
                                <SelectValue placeholder="$40 - $60" />
                            </SelectTrigger>

                            <SelectContent className="bg-white">
                                <SelectItem value="20-40">
                                    $20 - $40
                                </SelectItem>

                                <SelectItem value="40-60">
                                    $40 - $60
                                </SelectItem>

                                <SelectItem value="60-80">
                                    $60 - $80
                                </SelectItem>

                                <SelectItem value="80-plus">
                                    $80+
                                </SelectItem>
                            </SelectContent>
                        </Select>

                    </div>
                </div>
            </div>
        </div>
    )
}
