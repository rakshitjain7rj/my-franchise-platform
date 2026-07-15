import { Card, CardContent } from '@/components/ui/card'
import React from 'react'
import cakeImage from "../assets/dummy.avif";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Lock } from "lucide-react"





function OrderSummary() {
    return (
        <div>
            <Card className='py-0 '>
                <CardContent className='bg-white space-y-4 p-6'>
                    <h1 className='text-2xl text-[#4A154B]'>Order Summary</h1>
                    <div className='flex space-x-4 '>
                        <img src={cakeImage.src} alt="Artisan cake" className="w-14 h-14 rounded-md" />

                        <div className='justify-center '>
                            <h3>Artisian cake</h3>
                            <p>8&quot; Round, Signature</p>
                        </div>
                    </div>
                    <Separator className='w-full bg-slate-200 h-[0.5px]' />
                    <div className="flex gap-2 py-[5px]">
                        <input
                            type="text"
                            placeholder=" Discount Code"
                            className="w-full p-1 text-lg uppercase font-medium  border-2 rounded-md placeholder:text-sm"
                        />

                        <Button className='bg-slate p-5 rounded-lg border-2 border-slate-200 hover:bg-slate-200'>
                            Apply
                        </Button>
                    </div>
                    <Separator className='w-full  bg-slate-200 h-[0.5px]' />

                    <div className="space-y-2 px-7 text-lg  [&_span:first-child]:text-slate-500">
                        <div className="flex justify-between">
                            <span>Subtotal</span>
                            <span>$81.00</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Shipping</span>
                            <span>$12.00</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Tax</span>
                            <span>$7.29</span>
                        </div>
                    </div>
                    <Separator className='w-full  bg-slate-200 h-[0.5px]' />
                    <div className="flex justify-between px-7 font-bold text-xl py-2 text-[#4A154B]">

                        <span>Total</span>

                        <span>$100.29</span>

                    </div>
                    <Button className="w-full text-white bg-[#4A154B] p-8 text-lg hover:bg-[#3A103B] shadow-md transition-all duration-200 ease-in-out
               hover:-translate-y-1 hover:shadow-xl  ">
                        <Lock className="w-5 h-5 text-white" />
                        Complete Order & Pay
                    </Button>
                </CardContent>
            </Card>
        </div>
    )
}

export default OrderSummary


